import 'server-only'

import { decisionInicial, PERFILES } from '@sabbi/core'
import type { Perfil } from '@sabbi/core'
import type { FichaParseada } from '@sabbi/io'

import type { EstadoRevision, Parametros } from '../estado'
import { asesorActual, clienteServidor } from '../supabase/servidor'
import { cargarAjustesObjetivo } from './ajustes'
import { macroParaCalcular } from './macro'
import { altaProductosDeFicha } from './alta-productos'
import { completarDesdeCatalogo } from './completar'
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

/**
 * El mínimo de ETF cuando nadie lo dijo.
 *
 * Sale de la macro activa, no de una constante: es el mismo número que el
 * motor usa para decidir si una línea es ejecutable, y tenerlo escrito acá
 * también significaba que cambiarlo en la pantalla de Macro no cambiaba el
 * valor con el que nacía cada propuesta nueva.
 *
 * Es un default, no una atadura: el asesor lo mueve propuesta por propuesta en
 * el panel de parámetros, y esa elección se guarda y manda.
 */
const ticketEtfPorDefecto = async (): Promise<number> =>
  (await macroParaCalcular()).reglas.ticketEtfUsd

/** Sin perfil declarado en la ficha, el del medio: ni el más caro ni el más barato de corregir. */
const PERFIL_POR_DEFECTO: Perfil = 'Moderado'

/**
 * El perfil que declara la ficha, si es uno de los cinco.
 *
 * La ficha lo trae en el bloque de portafolio modelo. Ignorarlo y arrancar
 * siempre en Moderado obligaba al asesor a corregir a mano un dato que ya
 * estaba escrito en el archivo que acababa de subir.
 */
function perfilDeLaFicha(ficha: FichaParseada): Perfil {
  const declarado = ficha.modelo?.perfil?.trim()
  return PERFILES.find((perfil) => perfil === declarado) ?? PERFIL_POR_DEFECTO
}

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

  // La ficha llega con una propuesta completa, no con dieciséis casillas
  // vacías: se conserva lo que ya está en el portafolio objetivo y los
  // inmuebles, y el resto se vende, que es el dinero que el modelo reparte.
  // Todas quedan editables; el asesor corrige excepciones.
  const { error: errorPosiciones } = await supabase.from('ficha_positions').insert([
    ...ficha.posiciones.map((posicion) => {
      const productoId = alta.productoPorOrden.get(posicion.orden) ?? null
      const delCatalogo = alta.rendimientoPorOrden.get(posicion.orden)
      return {
        ...filaDePosicion(posicion, guardada.id),
        producto_id: productoId,
        cta: decisionInicial({ ...posicion, productoId }, alta.ofrecibles),
        ...(delCatalogo === undefined ? {} : { rendimiento_est: delCatalogo }),
      }
    }),
    ...ficha.deudas.map((deuda) => filaDeDeuda(deuda, guardada.id, ficha.posiciones.length)),
  ])

  if (errorPosiciones !== null) {
    return deshacer(`No pude guardar las posiciones: ${errorPosiciones.message}`)
  }

  const avisosAlta = [
    ...(alta.rendimientoPorOrden.size > 0
      ? [
          {
            codigo: 'rendimiento_del_catalogo',
            mensaje:
              `${alta.rendimientoPorOrden.size} ${alta.rendimientoPorOrden.size === 1 ? 'posición llegó' : 'posiciones llegaron'} sin rendimiento y lo tomé ` +
              'del catálogo, como punto medio de la banda del producto. Revisalo si el cliente tiene una cifra propia.',
          },
        ]
      : []),
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
  const porDefecto = await ticketEtfPorDefecto()

  const { error: errorPropuesta } = await supabase.from('proposals').insert({
    client_id: cliente.id,
    ficha_id: guardada.id,
    advisor_id: asesor.id,
    titulo: `Chequeo Patrimonial 360° — ${ficha.cliente.nombre ?? 'sin nombre'}`,
    perfil: perfilDeLaFicha(ficha),
    segmento: ficha.totales.invertibleUsd >= 500_000 ? 'gte500' : 'lt500',
    patrimonio_financiero_usd: ficha.totales.invertibleUsd,
    patrimonio_uso_propio_usd: ficha.totales.usoPropioUsd,
    ticket_minimo_etf_usd: minimoEtf !== null && minimoEtf > 0 ? minimoEtf : porDefecto,
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
  colchon_liquidez_usd: number
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
        'colchon_liquidez_usd, ticket_minimo_etf_usd',
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

  // Lo que el asesor le hizo al portafolio objetivo cuelga de la propuesta, no
  // de la ficha: sin propuesta abierta no hay ajustes que traer.
  const { agregados, ajustes } = await cargarAjustesObjetivo(propuesta?.id ?? '')

  const guardadas = ((filas ?? []) as FilaPosicion[])
    // Las deudas viven en la misma tabla pero no se revisan ni entran al motor.
    .filter((fila) => fila.origen !== 'deuda')
    .map(posicionDeFila)

  // El catálogo se sigue llenando después de subir la ficha: lo que la mesa
  // cargó el martes tiene que completar la ficha del lunes.
  const { posiciones, delCatalogo } = await completarDesdeCatalogo(guardadas)

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
    avisos: [
      ...((ficha.parse_warnings ?? []) as EstadoRevision['avisos']),
      ...(delCatalogo.length === 0
        ? []
        : [
            {
              codigo: 'rendimiento_del_catalogo' as const,
              mensaje:
                `${delCatalogo.length === 1 ? 'Una posición tomó' : `${delCatalogo.length} posiciones tomaron`} ` +
                'su rendimiento del catálogo, como punto medio de la banda del producto: ' +
                `${delCatalogo.slice(0, 6).join(', ')}${delCatalogo.length > 6 ? '…' : ''}. ` +
                'Corregilo en la columna de rendimiento si el cliente tiene una cifra propia.',
            },
          ]),
    ],
    ignoradas: (ficha.ignoradas ?? []) as EstadoRevision['ignoradas'],
    modelo: (ficha.modelo ?? null) as EstadoRevision['modelo'],
    posiciones,
    agregados,
    ajustes,
    parametros: {
      perfil: (propuesta?.perfil ?? 'Moderado') as Parametros['perfil'],
      necesitaFlujos: cliente?.necesita_flujos ?? false,
      usPerson: cliente?.us_person ?? false,
      institucional: (propuesta?.institucional_override ?? 'auto') as Parametros['institucional'],
      incluirInmueblesDeRenta: propuesta?.toggle_inm_seccion_propia ?? true,
      colchonLiquidezUsd: propuesta?.colchon_liquidez_usd ?? 0,
      ticketMinimoUsd: propuesta?.ticket_minimo_etf_usd ?? (await ticketEtfPorDefecto()),
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
