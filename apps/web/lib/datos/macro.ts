import 'server-only'

import { MACRO_DE_FABRICA, validarMacro } from '@sabbi/config'
import type { Macro } from '@sabbi/config'

import type { VersionDeMacro } from '../macro-edicion'
import { asesorActual, clienteServidor } from '../supabase/servidor'

/**
 * La macro activa: la única fuente de la que sale un portafolio.
 *
 * La leen los tres caminos que producen cifras — la propuesta en pantalla, la
 * matriz del benchmark y los dos decks — y ninguno tiene otra. Por eso guardar
 * una macro nueva cambia todo lo que se calcule después sin tocar una línea de
 * código: no hay una segunda copia de estos números en ningún lado.
 *
 * Lo que ya está calculado no se mueve, porque nada está calculado: cada
 * lectura corre el motor otra vez. Una propuesta abierta ayer con la macro
 * vieja se recalcula hoy con la nueva, y eso es lo que la mesa quiere — es el
 * modelo el que cambió.
 *
 * Ante cualquier duda, la de fábrica. Una macro que no valida no se usa a
 * medias: mezclar la mitad guardada con la mitad de fábrica produciría un
 * portafolio que no es ninguno de los dos.
 */

interface FilaMacro {
  version: number
  payload: unknown
  nota: string
  created_at: string
  advisors: { nombre: string } | null
}

export interface MacroActiva {
  readonly macro: Macro
  /** `false` cuando la base no tiene ninguna guardada o la que tiene no valida. */
  readonly esDeFabrica: boolean
  /** Por qué se cayó a la de fábrica, si se cayó. */
  readonly problema: string | null
  readonly guardadaEn: string | null
  readonly guardadaPor: string | null
}

const FABRICA: MacroActiva = {
  macro: MACRO_DE_FABRICA,
  esDeFabrica: true,
  problema: null,
  guardadaEn: null,
  guardadaPor: null,
}

export async function macroActiva(): Promise<MacroActiva> {
  const supabase = await clienteServidor()

  const { data, error } = await supabase
    .from('macro_versions')
    .select('version, payload, nota, created_at, advisors:created_by (nombre)')
    .eq('activa', true)
    .maybeSingle<FilaMacro>()

  // La tabla puede no existir todavía —la migración es nueva— y eso no puede
  // dejar sin propuesta a nadie: el modelo de fábrica es el que estaba en el
  // código hasta ayer.
  if (error !== null || data === null || data === undefined) return FABRICA

  const validada = validarMacro(data.payload)
  if (!validada.ok) {
    return {
      ...FABRICA,
      problema:
        `La macro v${data.version} guardada en la base no valida y se está calculando con la ` +
        `de fábrica. ${validada.errores.slice(0, 3).join(' · ')}`,
    }
  }

  return {
    macro: validada.macro,
    esDeFabrica: false,
    problema: null,
    guardadaEn: data.created_at,
    guardadaPor: data.advisors?.nombre ?? null,
  }
}

/** Solo la macro, para quien no necesita saber de dónde salió. */
export const macroParaCalcular = async (): Promise<Macro> => (await macroActiva()).macro

export type { VersionDeMacro }

/** El historial, para poder leer qué se cambió y cuándo. */
export async function versionesDeMacro(limite = 12): Promise<readonly VersionDeMacro[]> {
  const supabase = await clienteServidor()

  const { data } = await supabase
    .from('macro_versions')
    .select('version, nota, created_at, activa, advisors:created_by (nombre)')
    .order('version', { ascending: false })
    .limit(limite)
    .returns<
      {
        version: number
        nota: string
        created_at: string
        activa: boolean
        advisors: { nombre: string } | null
      }[]
    >()

  return (data ?? []).map((fila) => ({
    version: fila.version,
    nota: fila.nota,
    creadaEn: fila.created_at,
    autor: fila.advisors?.nombre ?? null,
    activa: fila.activa,
  }))
}

export type ResultadoGuardarMacro =
  | { readonly ok: true; readonly version: number }
  | { readonly ok: false; readonly errores: readonly string[] }

/**
 * Guarda una macro nueva y la activa.
 *
 * La toca cualquier asesor con ficha en `advisors`, no solo un admin: quien
 * calibra el modelo es la mesa, y pedirle permiso a alguien por cada prueba es
 * como se termina calibrando en una hoja aparte. Lo que protege el modelo no
 * es el candado sino el rastro.
 *
 * Nunca sobreescribe: la anterior queda con su autor y su fecha. Una cifra que
 * salió en la propuesta de un cliente real se explica por la macro con la que
 * se calculó, y esa explicación tiene que seguir estando el mes que viene.
 *
 * La validación es la misma que usa la lectura. Escribir algo que después no
 * se puede leer dejaría el modelo corriendo de fábrica en silencio.
 */
export async function guardarMacro(
  crudo: unknown,
  nota: string,
): Promise<ResultadoGuardarMacro> {
  const asesor = await asesorActual()
  if (asesor === null) return { ok: false, errores: ['No hay sesión de asesor.'] }

  const supabase = await clienteServidor()

  const { data: ultima } = await supabase
    .from('macro_versions')
    .select('version')
    .order('version', { ascending: false })
    .limit(1)
    .maybeSingle<{ version: number }>()

  const version = (ultima?.version ?? 0) + 1

  const validada = validarMacro({ ...(crudo as object), version })
  if (!validada.ok) return { ok: false, errores: validada.errores }

  // Desactivar primero: el índice único deja una sola activa, y hacerlo al
  // revés lo violaría en el instante entre las dos escrituras.
  const { error: apagado } = await supabase
    .from('macro_versions')
    .update({ activa: false })
    .eq('activa', true)
  if (apagado !== null) return { ok: false, errores: [traducir(apagado.message)] }

  const { error } = await supabase.from('macro_versions').insert({
    version,
    payload: { ...validada.macro, nota },
    nota,
    activa: true,
    created_by: asesor.id,
  })

  if (error !== null) return { ok: false, errores: [traducir(error.message)] }

  return { ok: true, version }
}

function traducir(crudo: string): string {
  if (crudo.includes('row-level security')) {
    return (
      'Tu usuario no tiene ficha de asesor, así que no hay a quién atribuirle esta versión. ' +
      'Pedile a un admin que te dé de alta.'
    )
  }
  if (crudo.includes('does not exist') || crudo.includes('relation')) {
    return 'La tabla de macros todavía no está en esta base. Corré la migración 0010.'
  }
  return crudo
}
