/**
 * Que le falta a una posicion para sostener la propuesta.
 *
 * La regla de producto es una sola: ningun dato vacio pasa en silencio. La
 * ficha llega como llega — el parser no inventa — pero la propuesta no se
 * publica hasta que alguien llene lo que falta. Este modulo es la definicion
 * unica de "completo": la pantalla de revision marca celdas con ella y el
 * armado de la propuesta bloquea con ella. Dos listas distintas ya seria una
 * mentira esperando a pasar.
 *
 * El rendimiento estimado es obligatorio en lo financiero invertible porque la
 * vista de rentabilidad del portafolio actual se calcula con el: sin ese dato
 * la cifra del "antes" seria una suma parcial disfrazada de total.
 */

export interface PosicionCompletable {
  readonly origen: 'financiero' | 'inmueble'
  readonly esInvertible: boolean
  readonly assetClass: string | null
  readonly claseModelo: string | null
  readonly moneda: string | null
  readonly valorUsd: number
  readonly rendimientoEst: number | null
  readonly uso?: string | null
}

/** Etiquetas legibles de cada campo, para avisos y tooltips. */
export const ETIQUETA_CAMPO: Readonly<Record<string, string>> = {
  claseModelo: 'clase del motor',
  assetClass: 'asset class',
  moneda: 'moneda',
  valorUsd: 'valor USD',
  rendimientoEst: 'rendimiento estimado',
  uso: 'uso del inmueble',
}

/**
 * Los campos vacios de una posicion, en orden de importancia.
 *
 * Un inmueble de uso propio queda fuera de todo calculo, asi que solo se le
 * exige el uso — que es justamente el campo que decide si queda fuera.
 */
export function camposFaltantes(posicion: PosicionCompletable): readonly string[] {
  const faltan: string[] = []

  if (posicion.origen === 'inmueble') {
    if (posicion.uso === null || posicion.uso === undefined || posicion.uso === '') {
      faltan.push('uso')
    }
    if (!posicion.esInvertible) return faltan
  }

  if (posicion.claseModelo === null) faltan.push('claseModelo')
  if (posicion.assetClass === null || posicion.assetClass === '') faltan.push('assetClass')
  if (posicion.moneda === null) faltan.push('moneda')
  if (!(posicion.valorUsd > 0)) faltan.push('valorUsd')
  if (posicion.origen === 'financiero' && posicion.rendimientoEst === null) {
    faltan.push('rendimientoEst')
  }

  return faltan
}

export interface FaltanteDePosicion {
  readonly institucionProducto: string
  readonly campos: readonly string[]
}

/** Las posiciones incompletas de una revision, listas para un bloqueo. */
export function posicionesIncompletas<
  T extends PosicionCompletable & { readonly institucionProducto: string },
>(posiciones: readonly T[]): readonly FaltanteDePosicion[] {
  return posiciones
    .map((posicion) => ({
      institucionProducto: posicion.institucionProducto,
      campos: camposFaltantes(posicion),
    }))
    .filter((f) => f.campos.length > 0)
}
