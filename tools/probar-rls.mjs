/**
 * Prueba las politicas RLS con dos asesores distintos.
 *
 *   DBPASS='...' node tools/probar-rls.mjs
 *
 * Comprueba la regla central del producto: la biblioteca es compartida para
 * leer y privada para escribir. Cualquier asesor ve todas las propuestas de la
 * organizacion, pero solo el dueno o un admin puede modificarlas.
 *
 * Corre dentro de una transaccion que siempre se revierte, asi que no deja
 * datos en la base.
 */
import { randomUUID } from 'node:crypto'

import pg from 'pg'

const REF = 'rjodepuqtbmpjnexhgli'
const HOST = 'aws-0-ca-central-1.pooler.supabase.com'

const pass = process.env.DBPASS
if (!pass) {
  console.error('Falta DBPASS.')
  process.exit(1)
}

const cliente = new pg.Client({
  connectionString: `postgresql://postgres.${REF}:${encodeURIComponent(pass)}@${HOST}:5432/postgres`,
  ssl: { rejectUnauthorized: false },
  connectionTimeoutMillis: 20_000,
})

await cliente.connect()
await cliente.query('begin')

const resultados = []
const comprobar = (descripcion, ok) => {
  resultados.push({ descripcion, ok })
  console.log(`${ok ? 'OK  ' : 'FALLA'} ${descripcion}`)
}

/**
 * Ejecuta como un usuario autenticado concreto, respetando RLS.
 *
 * Va sobre un savepoint porque un rechazo de RLS aborta la transaccion entera:
 * sin revertir hasta el savepoint, todo lo que viene despues falla con
 * "current transaction is aborted".
 */
async function comoUsuario(userId, fn) {
  await cliente.query('savepoint sp')
  try {
    await cliente.query('set local role authenticated')
    await cliente.query(`select set_config('request.jwt.claims', $1, true)`, [
      JSON.stringify({ sub: userId, role: 'authenticated' }),
    ])
    const salida = await fn()
    await cliente.query('release savepoint sp')
    return salida
  } catch (error) {
    await cliente.query('rollback to savepoint sp')
    throw error
  } finally {
    await cliente.query('reset role')
  }
}

/** Como `comoUsuario`, pero devuelve 0 cuando RLS rechaza en vez de propagar. */
async function intentar(userId, fn) {
  try {
    return await comoUsuario(userId, fn)
  } catch (error) {
    if (/row-level security|permission denied/i.test(error.message)) return 0
    throw error
  }
}

try {
  // Dos asesores y un admin.
  const userAna = randomUUID()
  const userBeto = randomUUID()
  const userAdmin = randomUUID()

  // advisors referencia auth.users, asi que los usuarios tienen que existir.
  // Se crean dentro de la transaccion y desaparecen con el rollback.
  for (const [id, email] of [
    [userAna, 'ana@sabbi.test'],
    [userBeto, 'beto@sabbi.test'],
    [userAdmin, 'admin@sabbi.test'],
  ]) {
    await cliente.query(
      `insert into auth.users (id, instance_id, aud, role, email, encrypted_password,
                               email_confirmed_at, created_at, updated_at)
       values ($1, '00000000-0000-0000-0000-000000000000', 'authenticated',
               'authenticated', $2, '', now(), now(), now())`,
      [id, email],
    )
  }

  const { rows: asesores } = await cliente.query(
    `insert into advisors (user_id, nombre, email, rol) values
       ($1, 'Ana Asesora', 'ana@sabbi.test',   'asesor'),
       ($2, 'Beto Asesor', 'beto@sabbi.test',  'asesor'),
       ($3, 'Admin',       'admin@sabbi.test', 'admin')
     returning id, nombre`,
    [userAna, userBeto, userAdmin],
  )
  const idAna = asesores[0].id


  const { rows: clientes } = await cliente.query(
    `insert into clients (nombre, advisor_id) values ('Cliente de Ana', $1) returning id`,
    [idAna],
  )
  const { rows: propuestas } = await cliente.query(
    `insert into proposals (client_id, advisor_id, titulo, perfil, segmento)
     values ($1, $2, 'Propuesta de Ana', 'Moderado', 'gte500') returning id`,
    [clientes[0].id, idAna],
  )
  const propuesta = propuestas[0].id

  // ── lectura compartida ──────────────────────────────────────────────────
  const vistaPorBeto = await comoUsuario(userBeto, async () => {
    const r = await cliente.query('select count(*)::int n from proposals where id = $1', [propuesta])
    return r.rows[0].n
  })
  comprobar('Beto lee la propuesta de Ana (biblioteca compartida)', vistaPorBeto === 1)

  const catalogo = await comoUsuario(userBeto, async () => {
    const r = await cliente.query('select count(*)::int n from products')
    return r.rows[0].n
  })
  comprobar('Beto lee el catalogo completo', catalogo === 307)

  // ── escritura restringida ───────────────────────────────────────────────
  const betoEscribe = await comoUsuario(userBeto, async () => {
    const r = await cliente.query(
      `update proposals set titulo = 'secuestrada' where id = $1 returning id`,
      [propuesta],
    )
    return r.rowCount
  })
  comprobar('Beto NO puede editar la propuesta de Ana', betoEscribe === 0)

  const anaEscribe = await comoUsuario(userAna, async () => {
    const r = await cliente.query(
      `update proposals set mandato = 'preservar capital' where id = $1 returning id`,
      [propuesta],
    )
    return r.rowCount
  })
  comprobar('Ana SI puede editar su propia propuesta', anaEscribe === 1)

  const adminEscribe = await comoUsuario(userAdmin, async () => {
    const r = await cliente.query(
      `update proposals set mandato = 'ajustado por admin' where id = $1 returning id`,
      [propuesta],
    )
    return r.rowCount
  })
  comprobar('El admin puede editar cualquier propuesta', adminEscribe === 1)

  // ── restricciones dinamicas heredan el permiso de su propuesta ──────────
  const betoRestringe = await intentar(userBeto, async () => {
    const r = await cliente.query(
      `insert into proposal_restrictions (proposal_id, nombre, monto_usd, clase)
       values ($1, 'Acciones MSFT', 30000, 'variable') returning id`,
      [propuesta],
    )
    return r.rowCount
  })
  comprobar('Beto NO puede agregar restricciones a la propuesta de Ana', betoRestringe === 0)

  const anaRestringe = await comoUsuario(userAna, async () => {
    const r = await cliente.query(
      `insert into proposal_restrictions (proposal_id, nombre, monto_usd, clase)
       values ($1, 'Acciones MSFT', 30000, 'variable') returning id`,
      [propuesta],
    )
    return r.rowCount
  })
  comprobar('Ana SI puede agregar una restriccion libre a su propuesta', anaRestringe === 1)

  // ── configuracion: lectura abierta, escritura solo admin ────────────────
  const betoTocaConfig = await intentar(userBeto, async () => {
    const r = await cliente.query(`update config_versions set nota = 'x' returning version`)
    return r.rowCount
  })
  comprobar('Beto NO puede tocar la configuracion', betoTocaConfig === 0)

  // ── una propuesta publicada no se sobreescribe ──────────────────────────
  await cliente.query(
    `update proposals set estado = 'publicada', published_at = now() where id = $1`,
    [propuesta],
  )
  let editaPublicada
  try {
    await comoUsuario(userAna, () =>
      cliente.query(`update proposals set titulo = 'otra cosa' where id = $1`, [propuesta]),
    )
    editaPublicada = 'permitido'
  } catch (error) {
    editaPublicada = error.message.includes('ya esta publicada')
      ? 'bloqueado'
      : `otro error: ${error.message}`
  }
  comprobar('Una propuesta publicada no se puede editar', editaPublicada === 'bloqueado')
} finally {
  await cliente.query('rollback')
  await cliente.end()
}

const fallos = resultados.filter((r) => !r.ok)
console.log(`\n${resultados.length - fallos.length}/${resultados.length} comprobaciones pasaron`)
console.log('La transaccion se revirtio: la base queda como estaba.')
process.exit(fallos.length === 0 ? 0 : 1)
