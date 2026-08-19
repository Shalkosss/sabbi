/**
 * Aplica las migraciones SQL contra la base de Supabase.
 *
 *   npm run migrar            (lee DBPASS de .env.local)
 *   npm run migrar -- --dry   (dice que aplicaria, sin tocar nada)
 *
 * Cada archivo de supabase/migrations corre dentro de una transaccion y queda
 * anotado en la tabla `_migraciones`. Volver a correr el script no repite lo ya
 * aplicado: es seguro invocarlo tantas veces como haga falta.
 */
import { readFileSync, readdirSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

import pg from 'pg'

const RAIZ = join(dirname(fileURLToPath(import.meta.url)), '..')
const DIR = join(RAIZ, 'supabase', 'migrations')
const REF = 'rjodepuqtbmpjnexhgli'
const HOST = 'aws-0-ca-central-1.pooler.supabase.com'

const seco = process.argv.includes('--dry')

const pass = process.env.DBPASS
if (!pass) {
  console.error(`Falta DBPASS.

  1. Pone la contrasena de la base en .env.local, en una linea:  DBPASS=...
  2. Corre:  npm run migrar

El archivo .env.local esta en .gitignore, asi que la contrasena no sale del equipo.`)
  process.exit(1)
}

const cliente = new pg.Client({
  connectionString: `postgresql://postgres.${REF}:${encodeURIComponent(pass)}@${HOST}:5432/postgres`,
  ssl: { rejectUnauthorized: false },
  connectionTimeoutMillis: 20_000,
  statement_timeout: 120_000,
})

await cliente.connect()

await cliente.query(`
  create table if not exists _migraciones (
    nombre     text primary key,
    aplicada   timestamptz not null default now()
  )
`)

const yaAplicadas = new Set(
  (await cliente.query('select nombre from _migraciones')).rows.map((r) => r.nombre),
)

const archivos = readdirSync(DIR)
  .filter((f) => f.endsWith('.sql'))
  .sort()

let aplicadas = 0
for (const archivo of archivos) {
  if (yaAplicadas.has(archivo)) {
    console.log(`   ya aplicada  ${archivo}`)
    continue
  }
  if (seco) {
    console.log(`   pendiente    ${archivo}`)
    continue
  }

  const sql = readFileSync(join(DIR, archivo), 'utf8')
  try {
    await cliente.query('begin')
    await cliente.query(sql)
    await cliente.query('insert into _migraciones (nombre) values ($1)', [archivo])
    await cliente.query('commit')
    console.log(`OK aplicada     ${archivo}`)
    aplicadas += 1
  } catch (error) {
    await cliente.query('rollback')
    console.error(`\nFallo ${archivo}, se revirtio la transaccion entera:\n  ${error.message}`)
    if (error.position) {
      const hasta = sql.slice(0, Number(error.position))
      const linea = hasta.split('\n').length
      console.error(`  linea ${linea}: ${sql.split('\n')[linea - 1]?.trim()}`)
    }
    await cliente.end()
    process.exit(1)
  }
}

const { rows } = await cliente.query(`
  select table_name from information_schema.tables
  where table_schema = 'public' and table_type = 'BASE TABLE'
  order by table_name
`)

console.log(`\n${aplicadas} migracion(es) nueva(s). Tablas en public: ${rows.length}`)
console.log(rows.map((r) => `  ${r.table_name}`).join('\n'))

await cliente.end()
