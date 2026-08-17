/**
 * Carga el catalogo, la taxonomia y la configuracion activa.
 *
 *   DBPASS='...' node tools/seed.mjs
 *
 * Es idempotente: reescribe por clave primaria en lugar de duplicar, asi que
 * se puede correr despues de cada cambio del catalogo.
 *
 * No carga datos de clientes. El catalogo y los benchmarks son de Sabbi; las
 * fichas y propuestas entran por la aplicacion.
 */
import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

import pg from 'pg'

const RAIZ = join(dirname(fileURLToPath(import.meta.url)), '..')
const REF = 'rjodepuqtbmpjnexhgli'
const HOST = 'aws-0-ca-central-1.pooler.supabase.com'

const pass = process.env.DBPASS
if (!pass) {
  console.error('Falta DBPASS.')
  process.exit(1)
}

const leerJson = (ruta) => JSON.parse(readFileSync(join(RAIZ, ruta), 'utf8'))

const catalogo = leerJson('reference/sabbi_configuracion_v2.json')
const benchmarks = leerJson('packages/config/benchmarks.v3.json')

/** Taxonomia inicial. La app la extiende sola cuando ve una clase nueva. */
const TAXONOMIA = [
  ['fondo mutuo money market', 'Fondos mutuos', 'Money Market', 'cash', 10],
  ['fondo mutuo corto plazo', 'Fondos mutuos', 'Money Market', 'cash', 10],
  ['fondo mutuo renta fija', 'Fondos mutuos', 'Bonos Públicos', 'fijo', 20],
  ['fondo mutuo renta variable', 'Fondos mutuos', 'Acciones Públicas', 'variable', 20],
  ['deposito plazo fijo', 'Deposito plazo fijo', 'Money Market', 'cash', 10],
  ['cuenta ahorros', 'Cuenta ahorros', 'Money Market', 'cash', 10],
  ['cts', 'Cuenta ahorros', 'Money Market', 'cash', 10],
  ['etf de bonos', null, 'Bonos Públicos', 'fijo', 20],
  ['etf de acciones', null, 'Acciones Públicas', 'variable', 20],
  ['private equity', 'Inversiones alternativas', 'Alternativos Private Equity', 'privados', 30],
  ['venture capital', 'Inversiones alternativas', 'Alternativos Private Equity', 'privados', 30],
  ['fondo inmobiliario', null, 'Club Deals Real Estate', 'privados', 30],
  ['club deal', null, 'Club Deals Real Estate', 'privados', 30],
  ['deuda privada', null, 'Alternativos Crédito Privado', 'privados', 30],
  ['prestamo directo', null, 'Alternativos Crédito Privado', 'privados', 30],
  ['fondo oportunidad', null, 'Alternativos Multi Asset Class', 'privados', 25],
  ['nota estructurada', null, 'Notas estructuradas', 'fijo', 20],
  ['seguro con devolucion', 'Otro', 'Money Market', 'fijo', 40],
  ['fondo universitario', 'Otro', 'Money Market', 'fijo', 40],
  ['inmueble en renta', null, 'Inmobiliario Directo', 'inm', 5],
]

const cliente = new pg.Client({
  connectionString: `postgresql://postgres.${REF}:${encodeURIComponent(pass)}@${HOST}:5432/postgres`,
  ssl: { rejectUnauthorized: false },
  connectionTimeoutMillis: 20_000,
  statement_timeout: 120_000,
})

await cliente.connect()
await cliente.query('begin')

try {
  // ── configuracion ────────────────────────────────────────────────────────
  await cliente.query('update config_versions set activa = false where activa')
  await cliente.query(
    `insert into config_versions (version, payload, nota, activa)
     values ($1, $2, $3, true)
     on conflict (version) do update
       set payload = excluded.payload, nota = excluded.nota, activa = true`,
    [
      benchmarks.version,
      JSON.stringify({ benchmarks, reglas: catalogo.reglas, privados: catalogo.privados }),
      'Benchmarks a precision plena desde la hoja Data. Reemplaza a la v2, cuyos ' +
        'pesos redondeados a cuatro decimales desplazaban la base de redistribucion.',
    ],
  )

  // ── catalogo ─────────────────────────────────────────────────────────────
  const productos = catalogo.productos ?? []
  for (const p of productos) {
    await cliente.query(
      `insert into products (
         id, nombre, clase, familia, ret_min, ret_max, dist_min, dist_max,
         dist_frecuencia, plazo, proposito, descripcion, comision_pct,
         comision_incluye_igv, moneda, gestor, administrador, foco_geo,
         subyacentes, min_ticket, ofrecer, reconocible, nota, config_version)
       values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20,$21,$22,$23,$24)
       on conflict (id) do update set
         nombre = excluded.nombre, clase = excluded.clase, familia = excluded.familia,
         ret_min = excluded.ret_min, ret_max = excluded.ret_max,
         min_ticket = excluded.min_ticket, ofrecer = excluded.ofrecer,
         reconocible = excluded.reconocible, config_version = excluded.config_version`,
      [
        p.id, txt(p.nombre) ?? p.id, txt(p.clase), txt(p.familia),
        num(p.retMin), num(p.retMax), num(p.distMin), num(p.distMax),
        txt(p.distFrecuencia), txt(p.plazo), txt(p.proposito), txt(p.desc),
        num(p.comisionPct), p.comisionIncluyeIGV ?? null, txt(p.moneda),
        txt(p.gestor), txt(p.administrador), txt(p.focoGeo),
        txt(p.subyacentes), num(p.minTicket), !!p.ofrecer, !!p.reconocible,
        txt(p.nota), benchmarks.version,
      ],
    )
  }

  // ── taxonomia ────────────────────────────────────────────────────────────
  for (const [patron, tipoFicha, assetClass, claseModelo, prioridad] of TAXONOMIA) {
    await cliente.query(
      `insert into asset_class_map (patron, tipo_ficha, asset_class, clase_modelo, prioridad)
       select $1,$2,$3,$4,$5
       where not exists (select 1 from asset_class_map where patron = $1)`,
      [patron, tipoFicha, assetClass, claseModelo, prioridad],
    )
  }

  await cliente.query('commit')
} catch (error) {
  await cliente.query('rollback')
  console.error('Fallo el seed, no se escribio nada:', error.message)
  await cliente.end()
  process.exit(1)
}

const cuenta = async (sql) => (await cliente.query(sql)).rows[0]

const prod = await cuenta(
  'select count(*)::int total, count(*) filter (where ofrecer)::int ofrecibles from products',
)
const tax = await cuenta('select count(*)::int total from asset_class_map')
const cfg = await cuenta('select version, activa from config_versions where activa')

console.log(`productos      ${prod.total} (ofrecibles: ${prod.ofrecibles})`)
console.log(`taxonomia      ${tax.total} patrones`)
console.log(`config activa  v${cfg.version}`)

await cliente.end()

function num(v) {
  if (v === null || v === undefined || v === '') return null
  const n = typeof v === 'number' ? v : Number(String(v).replace('%', ''))
  return Number.isFinite(n) ? n : null
}

/**
 * Cadena vacia a null.
 *
 * El catalogo usa '' donde no hay dato: un producto sin clase y 297 sin
 * familia. En la base eso tiene que ser null, no una cadena vacia que despues
 * hay que recordar tratar como ausente en cada consulta.
 */
function txt(v) {
  if (v === null || v === undefined) return null
  const s = String(v).trim()
  return s === '' ? null : s
}
