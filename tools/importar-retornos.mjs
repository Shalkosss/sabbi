/**
 * Siembra los fondos y sus series desde el libro de la mesa.
 *
 *   npm run importar-retornos -- reference/Macro_Base_Retornos_Master_Funds.xlsm
 *   npm run importar-retornos -- <libro.xlsm> --dry
 * *   npm run importar-retornos -- <libro.xlsm> --treasury
 *
 * Reemplaza la carga a mano de las primeras cuatro mil observaciones. Despues
 * de esto la mesa carga un mes por vez desde `/retornos/carga`, que es lo que
 * el modulo existe para hacer.
 *
 * Es idempotente: escribe por clave (`fondos.nombre`, `(fondo_id, mes)`) y se
 * puede correr de nuevo cada vez que alguien toque el libro. No borra nada —
 * ni fondos que ya no esten en el libro, ni meses que la mesa haya corregido a
 * mano en una fila que el libro trae vacia.
 *
 * El Treasury 10Y solo entra con `--treasury`, y con una reconstruccion que
 * conviene entender antes de usarla. Ver mas abajo.
 */
import { readFileSync } from 'node:fs'

import pg from 'pg'

import { parsearRetornos } from '@sabbi/io'

const REF = 'rjodepuqtbmpjnexhgli'
const HOST = 'aws-0-ca-central-1.pooler.supabase.com'

const MESES_DEL_ANIO = [
  'enero',
  'febrero',
  'marzo',
  'abril',
  'mayo',
  'junio',
  'julio',
  'agosto',
  'septiembre',
  'octubre',
  'noviembre',
  'diciembre',
]

const argumentos = process.argv.slice(2)
const ruta = argumentos.find((a) => !a.startsWith('--'))
const seco = argumentos.includes('--dry')
const conTreasury = argumentos.includes('--treasury')

if (ruta === undefined) {
  console.error(
    'Falta la ruta del .xlsm.\n\n' +
      '  npm run importar-retornos -- reference/Macro_Base_Retornos_Master_Funds.xlsm',
  )
  process.exit(1)
}

/**
 * `DATABASE_URL` gana sobre `DBPASS`.
 *
 * Es lo que permite correr el importador entero contra una base local antes de
 * tocar la de produccion. Sembrar cuatro mil observaciones sin haber visto
 * nunca la sentencia correr no es una cosa que convenga hacer de una.
 */
const url = process.env.DATABASE_URL
const pass = process.env.DBPASS
if (!url && !pass && !seco) {
  console.error(`Falta DBPASS.

  1. Pone la contrasena de la base en .env.local, en una linea:  DBPASS=...
  2. Corre:  npm run importar-retornos -- <libro.xlsm>

El archivo .env.local esta en .gitignore, asi que la contrasena no sale del equipo.`)
  process.exit(1)
}

const libro = parsearRetornos(new Uint8Array(readFileSync(ruta)))

/**
 * Solo entran las columnas con clase.
 *
 * `fondos.asset_class` referencia a `fondos_clases` y no acepta null. Una
 * columna que no cae en ninguna de las seis se informa y se deja afuera: es
 * preferible que falte un fondo — visible en el conteo — a que entre uno bajo
 * una clase inventada, que despues ensucia todos los promedios de esa clase.
 */
const importables = libro.fondos.filter((f) => f.assetClass !== null)
const sinClase = libro.fondos.filter((f) => f.assetClass === null)

const observaciones = importables.reduce((n, f) => n + f.serie.length, 0)

console.log(`=== ${ruta}`)
console.log(`  fondos a escribir     ${importables.filter((f) => !f.esReferencia).length}`)
console.log(`  indices a escribir    ${importables.filter((f) => f.esReferencia).length}`)
console.log(`  observaciones         ${observaciones}`)
if (sinClase.length > 0) {
  console.log(`  SIN CLASE, no entran  ${sinClase.map((f) => f.nombre).join(', ')}`)
}

for (const aviso of libro.avisos) {
  console.log(`  [${aviso.motivo}] ${aviso.fondo ?? ''}: ${aviso.detalle}`)
}

// ── El Treasury ─────────────────────────────────────────────────────────────
// La hoja no guarda una serie: guarda doce casilleros rotulados solo por
// nombre de mes — «Treasury 10Y (enero)» — que la mesa pisa cada vez que
// cierra ese mes. Al cabo de un anio, cada casillero tiene el ultimo cierre
// que le toco, y los doce juntos no son un anio calendario sino una ventana
// movil hacia atras desde el ultimo mes cargado.
//
// De ahi sale la reconstruccion: si el libro llega hasta julio de 2026,
// entonces enero a julio se escribieron este anio y agosto a diciembre son los
// del anterior, que es la ultima vez que esos meses cerraron.
//
// Es una inferencia, no un dato, y por eso `--treasury` es opcional y el
// listado se imprime entero para revisarlo. Desde la 0016 esta serie es el
// risk-free del Sharpe: un cierre mal fechado mueve la columna de Sharpe de
// los fondos que terminan en ese mes, y no se nota mirando la pantalla.
const ultimoMesDelLibro = importables
  .flatMap((f) => f.serie.map((p) => p.mes))
  .reduce((a, b) => (b > a ? b : a), '0000-00')

const treasury = []
if (conTreasury && ultimoMesDelLibro !== '0000-00') {
  const anioTope = Number(ultimoMesDelLibro.slice(0, 4))
  const mesTope = Number(ultimoMesDelLibro.slice(5, 7))

  for (const [i, nombre] of MESES_DEL_ANIO.entries()) {
    const cierre = libro.treasuryPorMes[nombre]
    if (cierre === undefined) continue
    const numero = i + 1
    const anio = numero <= mesTope ? anioTope : anioTope - 1
    treasury.push({ mes: `${anio}-${String(numero).padStart(2, '0')}`, cierre })
  }
  treasury.sort((a, b) => a.mes.localeCompare(b.mes))

  console.log(`\n=== Treasury 10Y  (ventana movil hacia atras desde ${ultimoMesDelLibro})`)
  console.log(`  ${treasury.map((t) => `${t.mes} ${t.cierre}`).join('  ')}`)
  console.log(
    '  El anio de cada uno es inferido: la hoja solo dice el nombre del mes.\n' +
      '  Es el risk-free del Sharpe — revisarlos, y corregir en /retornos/carga.',
  )
} else {
  console.log('\n  Treasury 10Y: no se escribe. Ver `--treasury`.')
}

if (seco) {
  console.log('\nCorrida en seco: no se escribio nada.')
  process.exit(0)
}

const cliente = new pg.Client({
  connectionString:
    url ?? `postgresql://postgres.${REF}:${encodeURIComponent(pass)}@${HOST}:5432/postgres`,
  ...(url === undefined ? { ssl: { rejectUnauthorized: false } } : {}),
  connectionTimeoutMillis: 20_000,
  statement_timeout: 300_000,
})

await cliente.connect()
await cliente.query('begin')

try {
  let nuevos = 0
  let escritas = 0

  for (const fondo of importables) {
    // `nombre` es la clave: es con lo que la mesa lo llama y con lo que el
    // pegado desde Excel de la carga mensual lo empareja.
    const { rows } = await cliente.query(
      `insert into fondos (nombre, asset_class, inception, guidance_cp, domicilio, es_referencia)
       values ($1, $2, $3, $4, $5, $6)
       on conflict (nombre) do update set
         asset_class    = excluded.asset_class,
         inception      = coalesce(excluded.inception, fondos.inception),
         guidance_cp    = coalesce(excluded.guidance_cp, fondos.guidance_cp),
         domicilio      = coalesce(excluded.domicilio, fondos.domicilio),
         es_referencia  = excluded.es_referencia,
         actualizado_en = now()
       returning id, (xmax = 0) as es_nuevo`,
      [
        fondo.nombre,
        fondo.assetClass,
        fondo.inception,
        fondo.guidanceCortoPlazo,
        fondo.domicilio,
        fondo.esReferencia,
      ],
    )

    const fila = rows[0]
    if (fila === undefined) continue
    if (fila.es_nuevo) nuevos += 1

    // Una sola sentencia por fondo: cuarenta viajes en vez de cuatro mil.
    // `unnest` arma las filas del lado del servidor a partir de dos arreglos.
    await cliente.query(
      `insert into fondos_observaciones (fondo_id, mes, retorno_total)
       select $1, mes, retorno
       from unnest($2::text[], $3::numeric[]) as t(mes, retorno)
       on conflict (fondo_id, mes) do update set retorno_total = excluded.retorno_total`,
      [fila.id, fondo.serie.map((p) => p.mes), fondo.serie.map((p) => p.retornoTotal)],
    )
    escritas += fondo.serie.length
  }

  for (const t of treasury) {
    await cliente.query(
      'insert into treasury_10y (mes, cierre) values ($1, $2) ' +
        'on conflict (mes) do update set cierre = excluded.cierre',
      [t.mes, t.cierre],
    )
  }

  await cliente.query('commit')

  console.log('\n=== Escrito')
  console.log(`  fondos nuevos        ${nuevos}`)
  console.log(`  fondos actualizados  ${importables.length - nuevos}`)
  console.log(`  observaciones        ${escritas}`)
  console.log(`  Treasury 10Y         ${treasury.length}`)
} catch (error) {
  await cliente.query('rollback')
  console.error('\nNada se escribio: la transaccion se revirtio.')
  throw error
} finally {
  await cliente.end()
}
