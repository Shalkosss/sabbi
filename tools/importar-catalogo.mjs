/**
 * Carga la BD de productos en Supabase.
 *
 *   npm run importar-catalogo            (lee DBPASS de .env.local)
 *   npm run importar-catalogo -- --dry   (solo lee el .xlsx y cuenta)
 *
 * Es idempotente: escribe por clave y vuelve a armar la composicion de cada
 * producto en lugar de acumularla. Se puede correr cada vez que la mesa toque
 * la planilla.
 *
 * No borra productos. Los que estan en `products` y no en la planilla —
 * instrumentos que agrego el motor, como los ETF del benchmark — se dejan como
 * estan: la planilla es la fuente de lo que describe a un producto, no de que
 * productos existen.
 */
import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

import pg from 'pg'

import { parsearCatalogo } from '@sabbi/io'

const RAIZ = join(dirname(fileURLToPath(import.meta.url)), '..')
const REF = 'rjodepuqtbmpjnexhgli'
const HOST = 'aws-0-ca-central-1.pooler.supabase.com'

const ruta = process.argv[2]
const seco = process.argv.includes('--dry')

if (ruta === undefined) {
  console.error('Falta la ruta del .xlsx.')
  process.exit(1)
}

const pass = process.env.DBPASS
if (!pass && !seco) {
  console.error(`Falta DBPASS.

  1. Pone la contrasena de la base en .env.local, en una linea:  DBPASS=...
  2. Corre:  npm run importar-catalogo

El archivo .env.local esta en .gitignore, asi que la contrasena no sale del equipo.`)
  process.exit(1)
}

const catalogo = parsearCatalogo(new Uint8Array(readFileSync(join(RAIZ, ruta))))

/** La misma clave con la que se compara todo lo demas del catalogo. */
const clave = (texto) =>
  texto
    .normalize('NFD')
    .replace(/[\p{Mn}]/gu, '')
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, ' ')
    .trim()

/**
 * La clase del motor a partir de la clase macro dominante.
 *
 * El motor reparte en cinco clases y la planilla describe en seis: separa Club
 * deals de Mercados Privados, que para el motor son la misma bolsa. Se toma la
 * parte mas grande, que es la que decide donde vive el producto.
 */
const CLASE_MOTOR = {
  'Mercados Públicos - Fijo': 'fijo',
  'Mercados Públicos - Variable': 'variable',
  'Mercados Privados': 'privados',
  'Club deals': 'privados',
  'Inmobiliario Directo': 'inm',
  'Cash y Otros': 'cash',
}

/** Un id legible para un producto que la planilla trae y el catalogo no tenia. */
const idDe = (nombre, tomados) => {
  const base = clave(nombre).replace(/ /g, '-').slice(0, 40) || 'producto'
  let id = base
  let n = 2
  while (tomados.has(id)) {
    id = `${base}-${n}`
    n += 1
  }
  tomados.add(id)
  return id
}

/** La planilla trabaja en fracciones; la tabla `products` en puntos. */
const aPuntos = (fraccion) => (fraccion === null ? null : Number((fraccion * 100).toFixed(4)))

if (seco) {
  console.log('Corrida en seco: no se escribe nada.')
  console.log(`  productos leidos      ${catalogo.productos.length}`)
  console.log(`  gestores              ${catalogo.gestores.length}`)
  console.log(`  administradores       ${catalogo.administradores.length}`)
  console.log(`  avisos                ${catalogo.avisos.length}`)
  process.exit(0)
}

const cliente = new pg.Client({
  connectionString: `postgresql://postgres.${REF}:${encodeURIComponent(pass)}@${HOST}:5432/postgres`,
  ssl: { rejectUnauthorized: false },
  connectionTimeoutMillis: 20_000,
  statement_timeout: 300_000,
})

await cliente.connect()
await cliente.query('begin')

try {
  // ── Listas de validacion ──────────────────────────────────────────────────
  for (const [i, nombre] of catalogo.clasesActivo.entries()) {
    await cliente.query(
      'insert into clases_activo (nombre, orden) values ($1, $2) on conflict (nombre) do update set orden = excluded.orden',
      [nombre, i * 10],
    )
  }

  for (const [i, region] of catalogo.regiones.entries()) {
    await cliente.query(
      'insert into regiones (nombre, benchmark_pct, orden) values ($1, $2, $3) ' +
        'on conflict (nombre) do update set benchmark_pct = excluded.benchmark_pct, orden = excluded.orden',
      [region.nombre, region.benchmarkPct, i * 10],
    )
  }

  for (const subyacente of catalogo.subyacentes) {
    await cliente.query(
      'insert into subyacentes (nombre, clase_activo, score_performance) values ($1, $2, $3) ' +
        'on conflict (nombre) do update set clase_activo = excluded.clase_activo, score_performance = excluded.score_performance',
      [subyacente.nombre, subyacente.claseActivo, subyacente.scorePerformance],
    )
  }

  // ── Base interna ──────────────────────────────────────────────────────────
  for (const [tabla, actores] of [
    ['gestores', catalogo.gestores],
    ['administradores', catalogo.administradores],
  ]) {
    for (const actor of actores) {
      await cliente.query(
        `insert into ${tabla} (nombre, score) values ($1, $2) on conflict (nombre) do update set score = excluded.score`,
        [actor.nombre, actor.score],
      )
    }
  }

  // Los nombres que los productos usan y que la hoja de ranking no lista: se
  // dan de alta sin score, para que la clave foranea no tire el producto.
  const conocidos = async (tabla) => {
    const { rows } = await cliente.query(`select nombre from ${tabla}`)
    return new Map(rows.map((r) => [clave(r.nombre), r.nombre]))
  }
  const gestores = await conocidos('gestores')
  const administradores = await conocidos('administradores')

  const asegurar = async (tabla, indice, nombre) => {
    if (nombre === null) return null
    const existente = indice.get(clave(nombre))
    if (existente !== undefined) return existente
    await cliente.query(`insert into ${tabla} (nombre) values ($1) on conflict do nothing`, [nombre])
    indice.set(clave(nombre), nombre)
    return nombre
  }

  // ── Productos ─────────────────────────────────────────────────────────────
  const { rows: existentes } = await cliente.query('select id, nombre from products')
  const porNombre = new Map(existentes.map((r) => [clave(r.nombre), r.id]))
  const ids = new Set(existentes.map((r) => r.id))

  let actualizados = 0
  let nuevos = 0

  for (const producto of catalogo.productos) {
    const existente = porNombre.get(clave(producto.nombre))
    const id = existente ?? idDe(producto.nombre, ids)
    if (existente === undefined) nuevos += 1
    else actualizados += 1

    const dominante = producto.claseActivo[0]?.nombre
    const claseMotor = dominante === undefined ? null : (CLASE_MOTOR[dominante] ?? null)

    const gestor = await asegurar('gestores', gestores, producto.gestor)
    const administrador = await asegurar('administradores', administradores, producto.administrador)

    await cliente.query(
      `insert into products (
         id, nombre, clase, moneda, liquidez, comision_pct, ret_min, ret_max,
         gestor, administrador, gestor_nombre, administrador_nombre,
         es_producto_sabbi, subido_a_circle, actualizado_en
       ) values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14, now())
       on conflict (id) do update set
         nombre               = excluded.nombre,
         clase                = coalesce(products.clase, excluded.clase),
         moneda               = coalesce(excluded.moneda, products.moneda),
         liquidez             = coalesce(excluded.liquidez, products.liquidez),
         comision_pct         = coalesce(excluded.comision_pct, products.comision_pct),
         ret_min              = coalesce(excluded.ret_min, products.ret_min),
         ret_max              = coalesce(excluded.ret_max, products.ret_max),
         gestor               = coalesce(excluded.gestor, products.gestor),
         administrador        = coalesce(excluded.administrador, products.administrador),
         gestor_nombre        = coalesce(excluded.gestor_nombre, products.gestor_nombre),
         administrador_nombre = coalesce(excluded.administrador_nombre, products.administrador_nombre),
         es_producto_sabbi    = excluded.es_producto_sabbi,
         subido_a_circle      = excluded.subido_a_circle,
         actualizado_en       = now()`,
      [
        id,
        producto.nombre,
        claseMotor,
        producto.moneda,
        producto.liquidez,
        aPuntos(producto.comisionPct),
        aPuntos(producto.rentabilidadMin),
        aPuntos(producto.rentabilidadMax),
        producto.gestor,
        producto.administrador,
        gestor,
        administrador,
        producto.esProductoSabbi,
        producto.subidoACircle,
      ],
    )

    // La composicion se rehace entera: es la unica forma de que sacar una parte
    // en la planilla la saque tambien de la base.
    for (const [tabla, columna, partes] of [
      ['producto_foco_geografico', 'region', producto.focoGeografico],
      ['producto_clase_activo', 'clase_activo', producto.claseActivo],
      ['producto_subyacente', 'subyacente', producto.subyacentes],
    ]) {
      await cliente.query(`delete from ${tabla} where producto_id = $1`, [id])
      for (const parte of partes) {
        await cliente.query(
          `insert into ${tabla} (producto_id, ${columna}, pct) values ($1, $2, $3)`,
          [id, parte.nombre, parte.pct],
        )
      }
    }
  }

  await cliente.query('commit')

  console.log('=== Importado')
  console.log(`  productos actualizados  ${actualizados}`)
  console.log(`  productos nuevos        ${nuevos}`)
  console.log(`  gestores                ${catalogo.gestores.length}`)
  console.log(`  administradores         ${catalogo.administradores.length}`)
  console.log(`  subyacentes             ${catalogo.subyacentes.length}`)

  const { rows: descuadrados } = await cliente.query(
    'select nombre, foco, clase, subyacente from productos_descuadrados order by nombre',
  )
  if (descuadrados.length > 0) {
    console.log(`\n=== Composiciones que no cierran (${descuadrados.length})`)
    for (const fila of descuadrados) {
      const partes = [
        Math.abs(fila.foco - 1) > 0.015 && fila.foco > 0 ? `foco ${(fila.foco * 100).toFixed(1)}%` : null,
        Math.abs(fila.clase - 1) > 0.015 && fila.clase > 0 ? `clase ${(fila.clase * 100).toFixed(1)}%` : null,
        Math.abs(fila.subyacente - 1) > 0.015 && fila.subyacente > 0
          ? `subyacentes ${(fila.subyacente * 100).toFixed(1)}%`
          : null,
      ].filter(Boolean)
      console.log(`  ${fila.nombre} — ${partes.join(', ')}`)
    }
  }

  if (catalogo.avisos.length > 0) {
    console.log(`\n=== Avisos del parseo (${catalogo.avisos.length}) — ver revisar-catalogo.mjs`)
  }
} catch (error) {
  await cliente.query('rollback')
  console.error('No se importó nada. La transacción se revirtió.')
  throw error
} finally {
  await cliente.end()
}
