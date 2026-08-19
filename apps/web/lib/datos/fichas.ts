import 'server-only'

import type { FichaParseada } from '@sabbi/io'

import type { EstadoRevision, Parametros } from '../estado'
import { asesorActual, clienteServidor } from '../supabase/servidor'
import { altaProductosDeFicha } from './alta-productos'
import { filaDeDeuda, filaDePosicion, posicionDeFila } from './mapeo'
import type { FilaPosicion } from './mapeo'

/**
 * Persistencia de la ficha y de su revisión.
 *
 * Todo pasa por la sesión del asesor y por RLS: no hay clave de servicio en
 * ningún camino. Guardar una ficha crea tres cosas — el cliente, la ficha con
 * sus posiciones, y la propuesta en borrador que guarda los parámetros — y
 * cada una queda a nombre de quien la creó.
 */

/** Cuando la ficha no trae el bloque de modelo, este es el mínimo de la macro. */
const TICKET_ETF_POR_DEFECTO = 20_000

export interface FichaEnLista {
  readonly id: string
  readonly cliente: string
  readonly archivo: string
  readonly patrimonioUsd: number | null
  readonly fecha: string
}

/**
 * Crea cliente, ficha, posiciones y propuesta en borrador.
 *
 * Los cuatro inserts no son una transacción — PostgREST no la ofrece — así que
 * lo que falla a mitad de camino se deshace borrando el cliente: la cascada se
 * lleva la ficha y sus posiciones. Es preferible perder el intento a dejar una
 * ficha huérfana que el asesor va a encontrar vacía la semana que viene.
 */
export async function guardarFichaNueva(
  ficha: FichaParseada,
  archivo: string,
): Promise<{ readonly fichaId: string } | { readonly error: string }> {
  const asesor = await asesorActual()
  if (asesor === null) return { error: 'Tu cuenta no está enlazada a un asesor de Sabbi.' }

  const supabase = await clienteServidor()

  const { data: cliente, error: errorCliente } = await supabase
    .from('clients')
    .insert({
      nombre: ficha.cliente.nombre ?? `Ficha sin nombre (${archivo})`,
      horizonte: ficha.cliente.horizonte,
      advisor_id: asesor.id,
      notas: ficha.cliente.observaciones.join('\n'),
    })
    .select('id')
    .single()

  if (errorCliente !== null || cliente === null) {
    return { error: `No pude guardar el cliente: ${errorCliente?.message ?? 'sin detalle'}` }
  }

  const deshacer = async (mensaje: string) => {
    await supabase.from('clients').delete().eq('id', cliente.id)
    return { error: mensaje }
  }

  const { data: guardada, error: errorFicha } = await supabase
    .from('fichas')
    .insert({
      client_id: cliente.id,
      archivo_nombre: archivo,
      hoja: ficha.hoja,
      parse_warnings: ficha.avisos,
      ignoradas: ficha.ignoradas,
      modelo: ficha.modelo,
      flujo_actual: ficha.cliente.flujoActual,
      flujo_retiro: ficha.cliente.flujoRetiro,
      patrimonio_total_usd: ficha.totales.invertibleUsd,
      created_by: asesor.id,
    })
    .select('id')
    .single()

  if (errorFicha !== null || guardada === null) {
    return deshacer(`No pude guardar la ficha: ${errorFicha?.message ?? 'sin detalle'}`)
  }

  // La base de productos se alimenta sola: lo que la ficha trae y el catálogo
  // no conoce se da de alta acá, y cada posición queda enlazada a su producto.
  // Si el alta falla, la ficha sigue — el aviso queda junto a los del parser.
  const alta = await altaProductosDeFicha(supabase, ficha.posiciones, asesor.id)

  const { error: errorPosiciones } = await supabase.from('ficha_positions').insert([
    ...ficha.posiciones.map((posicion) => ({
      ...filaDePosicion(posicion, guardada.id),
      producto_id: alta.productoPorOrden.get(posicion.orden) ?? null,
    })),
    ...ficha.deudas.map((deuda) => filaDeDeuda(deuda, guardada.id, ficha.posiciones.length)),
  ])

  if (errorPosiciones !== null) {
    return deshacer(`No pude guardar las posiciones: ${errorPosiciones.message}`)
  }

  const avisosAlta = [
    ...(alta.creados.length > 0
      ? [
          {
            codigo: 'producto_nuevo',
            mensaje:
              alta.creados.length === 1
                ? `Di de alta "${alta.creados[0]}" en la base de productos; complétalo en el catálogo.`
                : `Di de alta ${alta.creados.length} productos nuevos en la base: ${alta.creados.join(', ')}. Complétalos en el catálogo.`,
          },
        ]
      : []),
    ...(alta.error === undefined ? [] : [{ codigo: 'producto_nuevo', mensaje: alta.error }]),
  ]

  if (avisosAlta.length > 0) {
    await supabase
      .from('fichas')
      .update({ parse_warnings: [...ficha.avisos, ...avisosAlta] })
      .eq('id', guardada.id)
  }

  const minimoEtf = ficha.modelo?.montoMinimoEtfUsd ?? null

  const { error: errorPropuesta } = await supabase.from('proposals').insert({
    client_id: cliente.id,
    ficha_id: guardada.id,
    advisor_id: asesor.id,
    titulo: `Chequeo Patrimonial 360° — ${ficha.cliente.nombre ?? 'sin nombre'}`,
    perfil: 'Moderado',
    segmento: ficha.totales.invertibleUsd >= 500_000 ? 'gte500' : 'lt500',
    patrimonio_financiero_usd: ficha.totales.invertibleUsd,
    patrimonio_uso_propio_usd: ficha.totales.usoPropioUsd,
    ticket_minimo_etf_usd: minimoEtf !== null && minimoEtf > 0 ? minimoEtf : TICKET_ETF_POR_DEFECTO,
  })

  if (errorPropuesta !== null) {
    return deshacer(`No pude abrir la propuesta: ${errorPropuesta.message}`)
  }

  return { fichaId: guardada.id }
}

interface FilaFicha {
  id: string
  client_id: string
  archivo_nombre: string | null
  hoja: string | null
  parse_warnings: unknown
  ignoradas: unknown
  modelo: unknown
  flujo_actual: string | null
  flujo_retiro: string | null
  clients: {
    nombre: string
    horizonte: string | null
    notas: string | null
    necesita_flujos: boolean
    us_person: boolean
  } | null
}

interface FilaPropuesta {
  id: string
  perfil: string | null
  institucional_override: string
  toggle_inm_seccion_propia: boolean
  fx: number
  colchon_liquidez_pen: number
  ticket_minimo_etf_usd: number
}

/** Carga una ficha con su revisión. `null` si no existe o no es visible. */
export async function cargarRevision(fichaId: string): Promise<EstadoRevision | null> {
  const supabase = await clienteServidor()

  const { data: ficha } = await supabase
    .from('fichas')
    .select(
      'id, client_id, archivo_nombre, hoja, parse_warnings, ignoradas, modelo, ' +
        'flujo_actual, flujo_retiro, ' +
        'clients(nombre, horizonte, notas, necesita_flujos, us_person)',
    )
    .eq('id', fichaId)
    .maybeSingle<FilaFicha>()

  if (ficha === null || ficha === undefined) return null

  const { data: propuesta } = await supabase
    .from('proposals')
    .select(
      'id, perfil, institucional_override, toggle_inm_seccion_propia, fx, ' +
        'colchon_liquidez_pen, ticket_minimo_etf_usd',
    )
    .eq('ficha_id', fichaId)
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle<FilaPropuesta>()

  const { data: filas } = await supabase
    .from('ficha_positions')
    .select('*')
    .eq('ficha_id', fichaId)
    .order('orden', { ascending: true })

  const posiciones = ((filas ?? []) as FilaPosicion[])
    // Las deudas viven en la misma tabla pero no se revisan ni entran al motor.
    .filter((fila) => fila.origen !== 'deuda')
    .map(posicionDeFila)

  const cliente = ficha.clients
  const notas = cliente?.notas ?? ''

  return {
    fichaId: ficha.id,
    propuestaId: propuesta?.id ?? '',
    clienteId: ficha.client_id,
    archivo: ficha.archivo_nombre ?? 'ficha.xlsx',
    hoja: ficha.hoja ?? '',
    cliente: {
      nombre: cliente?.nombre ?? null,
      horizonte: cliente?.horizonte ?? null,
      flujoActual: ficha.flujo_actual,
      flujoRetiro: ficha.flujo_retiro,
      observaciones: notas === '' ? [] : notas.split('\n'),
    },
    avisos: (ficha.parse_warnings ?? []) as EstadoRevision['avisos'],
    ignoradas: (ficha.ignoradas ?? []) as EstadoRevision['ignoradas'],
    modelo: (ficha.modelo ?? null) as EstadoRevision['modelo'],
    posiciones,
    parametros: {
      perfil: (propuesta?.perfil ?? 'Moderado') as Parametros['perfil'],
      necesitaFlujos: cliente?.necesita_flujos ?? false,
      usPerson: cliente?.us_person ?? false,
      institucional: (propuesta?.institucional_override ?? 'auto') as Parametros['institucional'],
      incluirInmueblesDeRenta: propuesta?.toggle_inm_seccion_propia ?? true,
      colchonLiquidezUsd: propuesta?.colchon_liquidez_pen ?? 0,
      ticketMinimoUsd: propuesta?.ticket_minimo_etf_usd ?? TICKET_ETF_POR_DEFECTO,
      fxPenUsd: propuesta?.fx ?? 3.4,
    },
  }
}

interface FilaListada {
  id: string
  archivo_nombre: string | null
  created_at: string
  patrimonio_total_usd: number | null
  clients: { nombre: string } | null
}

/** Las fichas que cargó este asesor, de la más reciente a la más vieja. */
export async function listarFichas(limite = 12): Promise<readonly FichaEnLista[]> {
  const asesor = await asesorActual()
  if (asesor === null) return []

  const supabase = await clienteServidor()

  const { data } = await supabase
    .from('fichas')
    .select('id, archivo_nombre, created_at, patrimonio_total_usd, clients(nombre)')
    .eq('created_by', asesor.id)
    .order('created_at', { ascending: false })
    .limit(limite)
    .returns<FilaListada[]>()

  return (data ?? []).map((fila) => ({
    id: fila.id,
    cliente: fila.clients?.nombre ?? 'Sin nombre',
    archivo: fila.archivo_nombre ?? 'ficha.xlsx',
    patrimonioUsd: fila.patrimonio_total_usd,
    fecha: fila.created_at,
  }))
}
