/**
 * La propuesta congelada.
 *
 * Un borrador no guarda cifras: se recalcula en cada lectura y por eso nunca
 * puede mostrar un numero que el motor ya no produciria. Una propuesta
 * publicada necesita lo contrario. Es la que se imprimio, se mando por correo
 * y se leyo en una reunion; si el mes que viene alguien corrige el catalogo o
 * la mesa guarda una macro nueva, esa propuesta no puede cambiar de cifras a
 * espaldas del cliente que ya la tiene.
 *
 * El snapshot es el objeto `Propuesta` entero mas lo que hace falta para
 * explicarlo: con que macro se calculo y con que version del motor. Con eso se
 * vuelve a pintar la pantalla, el Excel y los dos decks sin volver a correr
 * nada, aunque la ficha, el catalogo y la macro ya no existan como estaban.
 *
 * Se guarda como JSON y se lee como `unknown`, asi que hay que validarlo al
 * entrar. La validacion no repite el tipo campo por campo —seria una segunda
 * definicion de `Propuesta` condenada a desincronizarse— sino que comprueba lo
 * que las vistas leen: las siete secciones, las dos miradas del cliente y los
 * dos cuadres. Lo que no pasa por aca no se pinta como si fuera la propuesta;
 * se dice que el snapshot no se puede leer y se ofrece recalcular.
 */

import type { Propuesta } from './tipos.js'

/** Sube cuando el objeto guardado cambie de forma. Hoy solo existe la 1. */
export const FORMATO_SNAPSHOT = 1

export interface MacroDelSnapshot {
  /** Version de negocio de la macro. `null` cuando se calculo con la de fabrica. */
  readonly version: number | null
  readonly esDeFabrica: boolean
}

export interface SnapshotPropuesta {
  readonly formato: number
  readonly propuesta: Propuesta
  readonly macro: MacroDelSnapshot
  /** Version del motor que produjo las cifras. */
  readonly motor: string
  /** Cuando se congelo, en ISO. */
  readonly congeladaEn: string
}

export interface MetaSnapshot {
  readonly macro: MacroDelSnapshot
  readonly motor: string
  readonly congeladaEn: string
}

/** Arma el objeto que se guarda. No toca la propuesta. */
export const congelarPropuesta = (
  propuesta: Propuesta,
  meta: MetaSnapshot,
): SnapshotPropuesta => ({
  formato: FORMATO_SNAPSHOT,
  propuesta,
  macro: meta.macro,
  motor: meta.motor,
  congeladaEn: meta.congeladaEn,
})

export type LecturaSnapshot =
  | { readonly ok: true; readonly snapshot: SnapshotPropuesta }
  | { readonly ok: false; readonly motivo: string }

const esObjeto = (valor: unknown): valor is Record<string, unknown> =>
  typeof valor === 'object' && valor !== null && !Array.isArray(valor)

const tieneFilas = (valor: unknown, campo: string): boolean =>
  esObjeto(valor) && Array.isArray(valor[campo])

/** Las secciones que la pantalla, el Excel y los decks leen sin excepcion. */
function faltaEnLaPropuesta(propuesta: Record<string, unknown>): string | null {
  if (!esObjeto(propuesta['cliente']) || typeof propuesta['cliente']['nombre'] !== 'string') {
    return 'no trae el cliente'
  }

  for (const seccion of ['seccion1', 'seccion2', 'seccion3', 'seccion4'] as const) {
    if (!tieneFilas(propuesta[seccion], 'filas')) return `no trae la ${seccion}`
  }

  const seccion5 = propuesta['seccion5']
  if (!tieneFilas(seccion5, 'porMoneda') || !tieneFilas(seccion5, 'porPlaza')) {
    return 'no trae la seccion5'
  }

  const seccion6 = propuesta['seccion6']
  if (!esObjeto(seccion6) || !tieneFilas(seccion6, 'grupos') || !esObjeto(seccion6['parametros'])) {
    return 'no trae el portafolio objetivo'
  }
  if (typeof seccion6['cuadreUsd'] !== 'number') return 'el objetivo no trae su cuadre'

  const seccion7 = propuesta['seccion7']
  if (!esObjeto(seccion7) || !tieneFilas(seccion7, 'ventas') || !tieneFilas(seccion7, 'compras')) {
    return 'no trae el blotter'
  }
  if (typeof seccion7['cuadreUsd'] !== 'number') return 'el blotter no trae su cuadre'

  if (!esObjeto(propuesta['vistaHoy'])) return 'no trae el portafolio de hoy'
  if (!esObjeto(propuesta['comparativa'])) return 'no trae el antes y despues'
  if (!Array.isArray(propuesta['antesYDespues'])) return 'no trae el detalle por clase'
  if (!Array.isArray(propuesta['avisos'])) return 'no trae los avisos del calculo'

  return null
}

/**
 * Lee lo que quedo guardado. El motivo es para que la pantalla lo pueda
 * escribir: un snapshot ilegible es una propuesta publicada sin respaldo, y
 * eso hay que decirlo, no esconderlo detras de un recalculo silencioso.
 */
export function leerSnapshot(crudo: unknown): LecturaSnapshot {
  if (!esObjeto(crudo)) return { ok: false, motivo: 'no hay nada guardado' }

  if (crudo['formato'] !== FORMATO_SNAPSHOT) {
    return {
      ok: false,
      motivo: `esta en el formato ${String(crudo['formato'])} y esta version lee el ${FORMATO_SNAPSHOT}`,
    }
  }

  const propuesta = crudo['propuesta']
  if (!esObjeto(propuesta)) return { ok: false, motivo: 'no trae la propuesta' }

  const falta = faltaEnLaPropuesta(propuesta)
  if (falta !== null) return { ok: false, motivo: `la propuesta guardada ${falta}` }

  const macro = crudo['macro']
  if (!esObjeto(macro) || typeof macro['esDeFabrica'] !== 'boolean') {
    return { ok: false, motivo: 'no dice con que macro se calculo' }
  }

  const version = macro['version']
  if (version !== null && typeof version !== 'number') {
    return { ok: false, motivo: 'la version de la macro no es un numero' }
  }

  return {
    ok: true,
    snapshot: {
      formato: FORMATO_SNAPSHOT,
      propuesta: propuesta as unknown as Propuesta,
      macro: { version: version ?? null, esDeFabrica: macro['esDeFabrica'] },
      motor: typeof crudo['motor'] === 'string' ? crudo['motor'] : 'desconocido',
      congeladaEn: typeof crudo['congeladaEn'] === 'string' ? crudo['congeladaEn'] : '',
    },
  }
}
