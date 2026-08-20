/**
 * Prueba el viaje de ida y vuelta de una revision contra la base real.
 *
 *   DBPASS='...' node tools/probar-revision.mjs
 *
 * Repite exactamente los escritos que hace la app — guardar la ficha, corregir
 * una celda, mover un parametro, agregar un activo al objetivo y clavar una
 * clase — y despues lee como lee la pantalla, para comprobar que lo que vuelve
 * es lo que se guardo. Comprueba tambien que las
 * dos restricciones que la app tiene que respetar siguen rechazando lo
 * imposible: un monto a vender mayor que la posicion y un FX en cero.
 *
 * Corre como el asesor, con RLS activo, dentro de una transaccion que siempre
 * se revierte: no deja datos en la base.
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
const comprobar = (descripcion, ok, detalle) => {
  resultados.push({ descripcion, ok })
  console.log(`${ok ? 'OK  ' : 'FALLA'} ${descripcion}${ok || detalle === undefined ? '' : `\n      ${detalle}`}`)
}

/** Ejecuta como un usuario autenticado concreto, respetando RLS. */
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

/**
 * Igualdad estructural.
 *
 * `jsonb` no conserva el orden de las claves — las guarda por longitud y
 * despues alfabeticamente — asi que comparar el texto serializado da distinto
 * aunque el contenido sea el mismo. A la app le da igual: mapea por nombre.
 */
function iguales(a, b) {
  if (Array.isArray(a) && Array.isArray(b)) {
    return a.length === b.length && a.every((x, i) => iguales(x, b[i]))
  }
  if (a !== null && b !== null && typeof a === 'object' && typeof b === 'object') {
    const claves = Object.keys(a)
    return (
      claves.length === Object.keys(b).length && claves.every((clave) => iguales(a[clave], b[clave]))
    )
  }
  return a === b
}

/** Devuelve el mensaje de error en vez de propagarlo. */
async function rechaza(userId, fn) {
  try {
    await comoUsuario(userId, fn)
    return null
  } catch (error) {
    return error.message
  }
}

const IGNORADAS = [{ fila: 44, origen: 'financiero', institucionProducto: '', motivo: 'sin_nombre' }]
const MODELO = {
  perfil: 'Moderado',
  montoMinimoEtfUsd: 25_000,
  entradas: [{ etiqueta: 'Renta fija', usd: null, pct: 0.29 }],
}

try {
  const userAna = randomUUID()

  await cliente.query(
    `insert into auth.users (id, instance_id, aud, role, email, encrypted_password,
                             email_confirmed_at, created_at, updated_at)
     values ($1, '00000000-0000-0000-0000-000000000000', 'authenticated',
             'authenticated', 'ana@sabbi.test', '', now(), now(), now())`,
    [userAna],
  )

  const { rows: asesores } = await cliente.query(
    `insert into advisors (user_id, nombre, email, rol)
     values ($1, 'Ana Asesora', 'ana@sabbi.test', 'asesor') returning id`,
    [userAna],
  )
  const idAna = asesores[0].id

  // ── guardar la ficha, como guardarFichaNueva ────────────────────────────
  const { idFicha, idPropuesta, idPosicion } = await comoUsuario(userAna, async () => {
    const { rows: clientes } = await cliente.query(
      `insert into clients (nombre, horizonte, advisor_id, notas)
       values ('Ana Tumi', 'Largo plazo', $1, 'Quiere flujos\nNo vender el departamento')
       returning id`,
      [idAna],
    )

    const { rows: fichas } = await cliente.query(
      `insert into fichas (client_id, archivo_nombre, hoja, parse_warnings, ignoradas, modelo,
                           flujo_actual, flujo_retiro, patrimonio_total_usd, created_by)
       values ($1, 'ficha-ana.xlsx', 'Ficha', '[]'::jsonb, $2::jsonb, $3::jsonb,
               'Si, 5,000 al mes', 'A los 65', 1264392.99, $4)
       returning id`,
      [clientes[0].id, JSON.stringify(IGNORADAS), JSON.stringify(MODELO), idAna],
    )

    const { rows: posiciones } = await cliente.query(
      `insert into ficha_positions (ficha_id, orden, origen, institucion_producto, clase_modelo,
                                    moneda, plaza, valor_usd, es_invertible, cta)
       values ($1, 1, 'financiero', 'DPF Caja Huancayo', 'fijo', 'USD', 'Perú', 100000, true, 'sin_marcar')
       returning id`,
      [fichas[0].id],
    )

    await cliente.query(
      `insert into ficha_positions (ficha_id, orden, origen, institucion_producto,
                                    valor_usd, es_invertible, plaza)
       values ($1, 2, 'deuda', 'Hipoteca BCP', 80000, false, 'Perú')`,
      [fichas[0].id],
    )

    const { rows: propuestas } = await cliente.query(
      `insert into proposals (client_id, ficha_id, advisor_id, titulo, perfil, segmento,
                              ticket_minimo_etf_usd)
       values ($1, $2, $3, 'Chequeo Patrimonial', 'Moderado', 'gte500', $4)
       returning id`,
      [clientes[0].id, fichas[0].id, idAna, MODELO.montoMinimoEtfUsd],
    )

    return {
      idFicha: fichas[0].id,
      idPropuesta: propuestas[0].id,
      idPosicion: posiciones[0].id,
    }
  })

  comprobar('La ficha, sus posiciones y la propuesta se guardan como el asesor', true)

  // ── corregir una celda, como guardarPosicion ────────────────────────────
  const corregida = await comoUsuario(userAna, async () => {
    const r = await cliente.query(
      `update ficha_positions
         set valor_usd = $2, campos_editados = $3, editado_manualmente = true, updated_at = now()
       where id = $1 returning id`,
      [idPosicion, 214492.75, ['valorUsd']],
    )
    return r.rowCount
  })
  comprobar('Una celda corregida se guarda sola', corregida === 1)

  // ── mover parametros, como guardarParametros ────────────────────────────
  await comoUsuario(userAna, async () => {
    await cliente.query(
      `update proposals
         set perfil = 'Arriesgado', institucional_override = 'si',
             toggle_inm_seccion_propia = false, colchon_liquidez_usd = 15000,
             fx = 3.75, ticket_minimo_etf_usd = 30000
       where id = $1`,
      [idPropuesta],
    )
    await cliente.query(
      `insert into audit_log (proposal_id, advisor_id, accion, detalle)
       values ($1, $2, 'institucional_override', $3::jsonb)`,
      [idPropuesta, idAna, JSON.stringify({ de: 'auto', a: 'si' })],
    )
  })

  // ── leer como lee la pantalla, con cargarRevision ───────────────────────
  const vuelta = await comoUsuario(userAna, async () => {
    const { rows: fichas } = await cliente.query(
      `select f.ignoradas, f.modelo, f.flujo_actual, f.flujo_retiro, c.nombre, c.notas
         from fichas f join clients c on c.id = f.client_id
        where f.id = $1`,
      [idFicha],
    )
    const { rows: propuestas } = await cliente.query(
      `select perfil, institucional_override, toggle_inm_seccion_propia, fx,
              colchon_liquidez_usd, ticket_minimo_etf_usd
         from proposals where ficha_id = $1 order by created_at desc limit 1`,
      [idFicha],
    )
    const { rows: posiciones } = await cliente.query(
      `select origen, valor_usd, campos_editados, editado_manualmente
         from ficha_positions where ficha_id = $1 order by orden`,
      [idFicha],
    )
    const { rows: bitacora } = await cliente.query(
      `select accion, detalle from audit_log where proposal_id = $1`,
      [idPropuesta],
    )
    return { ficha: fichas[0], propuesta: propuestas[0], posiciones, bitacora }
  })

  const { ficha, propuesta, posiciones, bitacora } = vuelta

  comprobar(
    'Las filas ignoradas y el portafolio modelo vuelven enteros',
    iguales(ficha.ignoradas, IGNORADAS) && iguales(ficha.modelo, MODELO),
    JSON.stringify(ficha.modelo),
  )

  comprobar(
    'Los flujos declarados vuelven como los escribio el cliente',
    ficha.flujo_actual === 'Si, 5,000 al mes' && ficha.flujo_retiro === 'A los 65',
  )

  comprobar(
    'Las observaciones sobreviven al viaje',
    ficha.notas.split('\n').length === 2,
    ficha.notas,
  )

  const financiera = posiciones.find((p) => p.origen === 'financiero')
  comprobar(
    'La celda corregida vuelve con su marca de edicion',
    Number(financiera.valor_usd) === 214492.75 &&
      iguales(financiera.campos_editados, ['valorUsd']) &&
      financiera.editado_manualmente === true,
    JSON.stringify(financiera),
  )

  comprobar(
    'La deuda se guarda con las posiciones y queda fuera del calculo',
    posiciones.length === 2 && posiciones.some((p) => p.origen === 'deuda'),
  )

  comprobar(
    'Los parametros vuelven donde el asesor los dejo',
    propuesta.perfil === 'Arriesgado' &&
      propuesta.institucional_override === 'si' &&
      propuesta.toggle_inm_seccion_propia === false &&
      Number(propuesta.fx) === 3.75 &&
      Number(propuesta.colchon_liquidez_usd) === 15000,
    JSON.stringify(propuesta),
  )

  comprobar(
    'El ticket minimo de ETF ya no vuelve al default',
    Number(propuesta.ticket_minimo_etf_usd) === 30000,
    String(propuesta.ticket_minimo_etf_usd),
  )

  comprobar(
    'El forzado del check institucional queda en la bitacora',
    bitacora.length === 1 &&
      bitacora[0].accion === 'institucional_override' &&
      bitacora[0].detalle.de === 'auto' &&
      bitacora[0].detalle.a === 'si',
    JSON.stringify(bitacora),
  )

  // ── ajustar el objetivo, como guardarActivoAgregado y guardarAjusteDeClase ──
  const idActivo = randomUUID()

  await comoUsuario(userAna, async () => {
    // Nace en cero, como cuando el asesor todavia esta escribiendo el nombre.
    await cliente.query(
      `insert into proposal_restrictions (id, proposal_id, nombre, monto_usd, clase, created_by)
       values ($1, $2, '', 0, 'variable', $3)`,
      [idActivo, idPropuesta, idAna],
    )
    // Y el mismo camino lo corrige: la pantalla hace upsert por id.
    await cliente.query(
      `insert into proposal_restrictions (id, proposal_id, nombre, monto_usd, clase, created_by)
       values ($1, $2, 'Acciones MSFT', 30000, 'variable', $3)
       on conflict (id) do update
         set nombre = excluded.nombre, monto_usd = excluded.monto_usd, clase = excluded.clase`,
      [idActivo, idPropuesta, idAna],
    )

    await cliente.query(
      `insert into proposal_class_adjustments (proposal_id, clase, modo, monto_usd, created_by)
       values ($1, 'inm', 'fijar', 60000, $2)`,
      [idPropuesta, idAna],
    )
    // Dos ajustes sobre la misma clase son uno: la PK los funde.
    await cliente.query(
      `insert into proposal_class_adjustments (proposal_id, clase, modo, monto_usd, created_by)
       values ($1, 'inm', 'fijar', 65000, $2)
       on conflict (proposal_id, clase) do update
         set modo = excluded.modo, monto_usd = excluded.monto_usd, updated_at = now()`,
      [idPropuesta, idAna],
    )
    await cliente.query(
      `insert into proposal_class_adjustments (proposal_id, clase, modo, monto_usd, created_by)
       values ($1, 'cash', 'excluir', 0, $2)`,
      [idPropuesta, idAna],
    )
  })

  const objetivo = await comoUsuario(userAna, async () => {
    const { rows: agregados } = await cliente.query(
      `select id, nombre, monto_usd, clase, producto_id
         from proposal_restrictions where proposal_id = $1 order by orden`,
      [idPropuesta],
    )
    const { rows: ajustes } = await cliente.query(
      `select clase, modo, monto_usd
         from proposal_class_adjustments where proposal_id = $1 order by clase`,
      [idPropuesta],
    )
    return { agregados, ajustes }
  })

  comprobar(
    'Un activo agregado nace en cero y se corrige por el mismo camino',
    objetivo.agregados.length === 1 &&
      objetivo.agregados[0].nombre === 'Acciones MSFT' &&
      Number(objetivo.agregados[0].monto_usd) === 30000 &&
      objetivo.agregados[0].clase === 'variable' &&
      objetivo.agregados[0].producto_id === null,
    JSON.stringify(objetivo.agregados),
  )

  comprobar(
    'Los ajustes por clase vuelven como los dejo el asesor, uno por clase',
    objetivo.ajustes.length === 2 &&
      iguales(
        objetivo.ajustes.map((a) => [a.clase, a.modo, Number(a.monto_usd)]),
        [
          ['cash', 'excluir', 0],
          ['inm', 'fijar', 65000],
        ],
      ),
    JSON.stringify(objetivo.ajustes),
  )

  const borrados = await comoUsuario(userAna, async () => {
    const activo = await cliente.query('delete from proposal_restrictions where id = $1', [idActivo])
    const ajuste = await cliente.query(
      `delete from proposal_class_adjustments where proposal_id = $1 and clase = 'cash'`,
      [idPropuesta],
    )
    return { activo: activo.rowCount, ajuste: ajuste.rowCount }
  })
  comprobar(
    'Quitar un activo o sacar un ajuste borra su fila',
    borrados.activo === 1 && borrados.ajuste === 1,
    JSON.stringify(borrados),
  )

  // ── lo que la base tiene que seguir rechazando ──────────────────────────

  const ajusteAjeno = await rechaza(randomUUID(), () =>
    cliente.query(
      `insert into proposal_class_adjustments (proposal_id, clase, modo, monto_usd)
       values ($1, 'fijo', 'fijar', 1000)`,
      [idPropuesta],
    ),
  )
  comprobar(
    'Un ajuste sobre la propuesta de otro asesor sigue rebotando por RLS',
    ajusteAjeno !== null && /row-level security/.test(ajusteAjeno),
    ajusteAjeno ?? 'lo acepto',
  )

  const modoInventado = await rechaza(userAna, () =>
    cliente.query(
      `insert into proposal_class_adjustments (proposal_id, clase, modo, monto_usd)
       values ($1, 'fijo', 'triplicar', 1000)`,
      [idPropuesta],
    ),
  )
  comprobar(
    'Un modo que el motor no conoce sigue rebotando',
    modoInventado !== null && /proposal_class_adjustments_modo_check/.test(modoInventado),
    modoInventado ?? 'lo acepto',
  )

  const parcialImposible = await rechaza(userAna, () =>
    cliente.query(
      `update ficha_positions set cta = 'venta_parcial', monto_venta_parcial = 999999 where id = $1`,
      [idPosicion],
    ),
  )
  comprobar(
    'Un monto a vender mayor que la posicion sigue rebotando',
    parcialImposible !== null && /venta_parcial_no_supera_posicion/.test(parcialImposible),
    parcialImposible ?? 'lo acepto',
  )

  const fxCero = await rechaza(userAna, () =>
    cliente.query('update proposals set fx = 0 where id = $1', [idPropuesta]),
  )
  comprobar('Un FX en cero sigue rebotando', fxCero !== null, fxCero ?? 'lo acepto')

  const fallaron = resultados.filter((r) => !r.ok).length
  console.log(
    `\n${resultados.length - fallaron} de ${resultados.length} comprobaciones pasaron.` +
      ' Nada quedo en la base: la transaccion se revierte.',
  )
  process.exitCode = fallaron === 0 ? 0 : 1
} finally {
  await cliente.query('rollback')
  await cliente.end()
}
