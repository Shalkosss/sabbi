/**
 * Prueba las politicas RLS con dos asesores distintos.
 *
 *   DBPASS='...' node tools/probar-rls.mjs
 *
 * Comprueba la regla central del producto: la biblioteca es del equipo.
 * Cualquier asesor con ficha en `advisors` lee y edita el trabajo de la mesa —
 * una ficha se trabaja de a dos y hay cursores en vivo para eso.
 *
 * La frontera no desaparecio, se movio: ahora esta entre "asesor de Sabbi" y
 * "cuenta de Auth sin dar de alta". Las cuentas se crean a mano y la fila de
 * `advisors` llega despues, asi que ese hueco existe de verdad y una cuenta a
 * medio dar de alta no puede tocar el patrimonio de nadie. La configuracion y
 * el catalogo siguen siendo de admin.
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
  // Dos asesores, un admin y una cuenta sin dar de alta.
  const userAna = randomUUID()
  const userBeto = randomUUID()
  const userAdmin = randomUUID()
  const userSinAlta = randomUUID()

  // advisors referencia auth.users, asi que los usuarios tienen que existir.
  // Se crean dentro de la transaccion y desaparecen con el rollback.
  for (const [id, email] of [
    [userAna, 'ana@sabbi.test'],
    [userBeto, 'beto@sabbi.test'],
    [userAdmin, 'admin@sabbi.test'],
    [userSinAlta, 'sinalta@sabbi.test'],
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

  const { rows: fichas } = await cliente.query(
    `insert into fichas (client_id, archivo_nombre, created_by)
     values ($1, 'ficha-de-ana.xlsx', $2) returning id`,
    [clientes[0].id, idAna],
  )
  const ficha = fichas[0].id

  const { rows: posiciones } = await cliente.query(
    `insert into ficha_positions (ficha_id, origen, institucion_producto, valor_usd)
     values ($1, 'financiero', 'Fondo X', 100000) returning id`,
    [ficha],
  )
  const posicion = posiciones[0].id

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

  // ── escritura del equipo ────────────────────────────────────────────────
  const betoEscribe = await comoUsuario(userBeto, async () => {
    const r = await cliente.query(
      `update proposals set titulo = 'retomada por Beto' where id = $1 returning id`,
      [propuesta],
    )
    return r.rowCount
  })
  comprobar('Beto SI puede editar la propuesta de Ana (es del equipo)', betoEscribe === 1)

  // La frontera de verdad: una cuenta de Auth sin fila en `advisors`.
  const sinAltaEscribe = await intentar(userSinAlta, async () => {
    const r = await cliente.query(
      `update proposals set titulo = 'de nadie' where id = $1 returning id`,
      [propuesta],
    )
    return r.rowCount
  })
  comprobar('Una cuenta sin dar de alta NO puede editar nada', sinAltaEscribe === 0)

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

  // ── la ficha se trabaja de a dos ────────────────────────────────────────
  // Es el caso que motivo el cambio: dos asesores en la misma ficha, uno
  // corrigiendo posiciones y el otro mirando los cursores. Con la regla vieja
  // el segundo no podia escribir y la funcion entera no servia para nada.

  const betoCorrigePosicion = await intentar(userBeto, async () => {
    const r = await cliente.query(
      `update ficha_positions set valor_usd = 120000 where id = $1 returning id`,
      [posicion],
    )
    return r.rowCount
  })
  comprobar('Beto SI puede corregir una posicion de la ficha de Ana', betoCorrigePosicion === 1)

  const betoTocaFicha = await intentar(userBeto, async () => {
    const r = await cliente.query(
      `update fichas set patrimonio_total_usd = 120000 where id = $1 returning id`,
      [ficha],
    )
    return r.rowCount
  })
  comprobar('Beto SI puede editar la ficha de Ana', betoTocaFicha === 1)

  // Cambiar el perfil escribe en `clients` ademas de en `proposals`: si esta
  // quedaba cerrada, el guardado fallaba a mitad de camino.
  const betoTocaCliente = await intentar(userBeto, async () => {
    const r = await cliente.query(
      `update clients set necesita_flujos = true where id = $1 returning id`,
      [clientes[0].id],
    )
    return r.rowCount
  })
  comprobar('Beto SI puede editar el cliente de la ficha de Ana', betoTocaCliente === 1)

  const sinAltaTocaPosicion = await intentar(userSinAlta, async () => {
    const r = await cliente.query(
      `update ficha_positions set valor_usd = 1 where id = $1 returning id`,
      [posicion],
    )
    return r.rowCount
  })
  comprobar('Una cuenta sin dar de alta NO puede tocar una posicion', sinAltaTocaPosicion === 0)

  // ── restricciones dinamicas heredan el permiso de su propuesta ──────────
  const betoRestringe = await intentar(userBeto, async () => {
    const r = await cliente.query(
      `insert into proposal_restrictions (proposal_id, nombre, monto_usd, clase)
       values ($1, 'Acciones MSFT', 30000, 'variable') returning id`,
      [propuesta],
    )
    return r.rowCount
  })
  comprobar('Beto SI puede agregar restricciones a la propuesta de Ana', betoRestringe === 1)

  const sinAltaRestringe = await intentar(userSinAlta, async () => {
    const r = await cliente.query(
      `insert into proposal_restrictions (proposal_id, nombre, monto_usd, clase)
       values ($1, 'Colada', 1000, 'variable') returning id`,
      [propuesta],
    )
    return r.rowCount
  })
  comprobar('Una cuenta sin dar de alta NO puede agregar restricciones', sinAltaRestringe === 0)

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
