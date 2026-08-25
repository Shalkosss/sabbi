import 'server-only'

import type { SupabaseClient } from '@supabase/supabase-js'

import type { Parametros, PosicionEditada } from '../estado'
import { asesorActual, clienteServidor } from '../supabase/servidor'
import { COLUMNA_DE_CAMPO } from './mapeo'

/**
 * Autoguardado de la revisión.
 *
 * Cada corrección del asesor entra por acá mientras trabaja, así que estas dos
 * funciones se llaman muchas veces por minuto: mandan solo los campos que
 * cambiaron y no leen de vuelta lo que ya está en pantalla.
 */

/** Guarda los campos que el asesor corrigió en una posición. */
export async function guardarPosicion(
  posicionId: string,
  cambios: Partial<PosicionEditada>,
): Promise<{ readonly error?: string }> {
  const columnas: Record<string, unknown> = {}

  for (const [campo, columna] of Object.entries(COLUMNA_DE_CAMPO)) {
    if (campo in cambios) columnas[columna] = cambios[campo as keyof PosicionEditada]
  }
  if (Object.keys(columnas).length === 0) return {}

  columnas['editado_manualmente'] = true
  columnas['updated_at'] = new Date().toISOString()

  const supabase = await clienteServidor()
  const { error } = await supabase.from('ficha_positions').update(columnas).eq('id', posicionId)
  if (error !== null) return { error: error.message }

  return propagarAlCatalogo(supabase, posicionId, cambios)
}

/**
 * Lo que se escribe en la ficha viaja al catálogo.
 *
 * La mesa pidió no tener que entrar al catálogo a completar lo mismo dos
 * veces: la rentabilidad y la comisión se escriben donde se está trabajando
 * —la fila de la posición— y el producto queda actualizado para la próxima
 * propuesta. Cada posición financiera ya tiene su producto desde que se subió
 * la ficha, así que no hay nada que crear: solo escribirle.
 *
 * Dos cosas que conviene tener presentes, y que la pantalla dice:
 *
 *  - El catálogo guarda la rentabilidad como una banda —«7.5% a 9.5%»— y la
 *    ficha guarda un solo número. Escribirla desde acá la deja en un punto:
 *    mínimo y máximo iguales. Es lo que la mesa pidió y es una pérdida real de
 *    información cuando el producto tenía una banda cargada a mano.
 *  - Las columnas del catálogo van en puntos porcentuales y la ficha en
 *    fracción. Confundirlas daría un producto con 450% de retorno.
 *
 * Un fallo acá no puede tumbar el guardado de la posición, que ya se escribió:
 * se devuelve como error para que la barra de guardado lo muestre, sin
 * deshacer nada.
 */
async function propagarAlCatalogo(
  supabase: SupabaseClient,
  posicionId: string,
  cambios: Partial<PosicionEditada>,
): Promise<{ readonly error?: string }> {
  const tocaAlCatalogo = 'rendimientoEst' in cambios || 'feePct' in cambios
  if (!tocaAlCatalogo) return {}

  const { data: posicion } = await supabase
    .from('ficha_positions')
    .select('producto_id')
    .eq('id', posicionId)
    .maybeSingle<{ producto_id: string | null }>()

  const productoId = posicion?.producto_id ?? null
  // Los inmuebles no tienen producto, y una financiera cuyo alta falló al
  // subir la ficha tampoco. No es un error: no hay a quién escribirle.
  if (productoId === null) return {}

  const patch: Record<string, unknown> = {}
  if ('rendimientoEst' in cambios) {
    const puntos = aPuntos(cambios.rendimientoEst ?? null)
    patch['ret_min'] = puntos
    patch['ret_max'] = puntos
  }
  if ('feePct' in cambios) patch['comision_pct'] = aPuntos(cambios.feePct ?? null)

  const { error } = await supabase.from('products').update(patch).eq('id', productoId)
  return error === null
    ? {}
    : { error: `La posición se guardó, pero el catálogo no: ${error.message}` }
}

/** La ficha trabaja en fracción; las columnas del catálogo, en puntos. */
const aPuntos = (fraccion: number | null): number | null =>
  fraccion === null ? null : fraccion * 100

/**
 * Guarda los parámetros.
 *
 * Viven en dos tablas y no por capricho: el perfil regulatorio y la necesidad
 * de flujos son del cliente y sobreviven a cualquier propuesta; el resto son
 * decisiones de esta propuesta en particular.
 */
export async function guardarParametros(
  propuestaId: string,
  clienteId: string,
  parametros: Parametros,
): Promise<{ readonly error?: string }> {
  const supabase = await clienteServidor()

  const { data: previa } = await supabase
    .from('proposals')
    .select('institucional_override')
    .eq('id', propuestaId)
    .maybeSingle<{ institucional_override: string }>()

  const { error: errorPropuesta } = await supabase
    .from('proposals')
    .update({
      perfil: parametros.perfil,
      institucional_override: parametros.institucional,
      toggle_inm_seccion_propia: parametros.incluirInmueblesDeRenta,
      accede_inmobiliario: parametros.accedeInmobiliario,
      colchon_liquidez_usd: parametros.colchonLiquidezUsd,
      // Los dos tienen un check de mayor que cero en la base. Un input vacío
      // llega como 0 mientras el asesor termina de escribir: se deja el valor
      // anterior en vez de rebotar el guardado entero.
      ...(parametros.fxPenUsd > 0 ? { fx: parametros.fxPenUsd } : {}),
      ...(parametros.ticketMinimoUsd > 0
        ? { ticket_minimo_etf_usd: parametros.ticketMinimoUsd }
        : {}),
    })
    .eq('id', propuestaId)

  if (errorPropuesta !== null) return { error: errorPropuesta.message }

  const cambioElOverride =
    previa !== null &&
    previa !== undefined &&
    previa.institucional_override !== parametros.institucional

  const errorBitacora = cambioElOverride
    ? await anotarOverride(propuestaId, previa.institucional_override, parametros.institucional)
    : null

  const { error: errorCliente } = await supabase
    .from('clients')
    .update({
      perfil_riesgo: parametros.perfil,
      necesita_flujos: parametros.necesitaFlujos,
      us_person: parametros.usPerson,
    })
    .eq('id', clienteId)

  if (errorCliente !== null) return { error: errorCliente.message }

  return errorBitacora === null ? {} : { error: errorBitacora }
}

/**
 * Deja el forzado del check institucional en la bitácora.
 *
 * Es una decisión de una persona sobre si un cliente califica, y el motor la
 * obedece: tiene que quedar quién la tomó, cuándo y desde qué valor. Si la
 * anotación falla no se cancela el guardado — el parámetro ya cambió — pero el
 * error vuelve a la pantalla en vez de tragarse en silencio.
 */
async function anotarOverride(propuestaId: string, de: string, a: string): Promise<string | null> {
  const [asesor, supabase] = await Promise.all([asesorActual(), clienteServidor()])

  const { error } = await supabase.from('audit_log').insert({
    proposal_id: propuestaId,
    advisor_id: asesor?.id ?? null,
    accion: 'institucional_override',
    detalle: { de, a },
  })

  return error === null
    ? null
    : `El cambio se guardó pero no pude anotarlo en la bitácora: ${error.message}`
}
