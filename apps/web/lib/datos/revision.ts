import 'server-only'

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

  return error === null ? {} : { error: error.message }
}

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
    .select('institucional_override, estado')
    .eq('id', propuestaId)
    .maybeSingle<{ institucional_override: string; estado: string }>()

  // Una propuesta publicada no acepta parámetros nuevos: sus cifras ya están
  // congeladas y moverle el perfil o el ticket no cambiaría ninguna. La base
  // lo rechaza con una excepción; acá se dice antes y en castellano, porque
  // esto llega por el autoguardado y el asesor lo ve mientras escribe.
  if (previa?.estado === 'publicada') {
    return {
      error:
        'Esta propuesta ya está publicada y no se edita. Generá una versión nueva desde la ' +
        'propuesta para seguir trabajando.',
    }
  }

  const { error: errorPropuesta } = await supabase
    .from('proposals')
    .update({
      perfil: parametros.perfil,
      institucional_override: parametros.institucional,
      toggle_inm_seccion_propia: parametros.incluirInmueblesDeRenta,
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
