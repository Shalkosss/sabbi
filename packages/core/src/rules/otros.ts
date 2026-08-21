/**
 * Reparto de Otros: Oro y BTC.
 *
 * Hasta la config v3 "Otros" era una familia interna de Mercados Privados con
 * un solo destino, IBIT. Ahora es clase propia y se abre en dos instrumentos —
 * BTC via IBIT y Oro — con los pesos por perfil de la hoja Allocation
 * detallado.
 *
 * Dos umbrales:
 *
 *  - La clase entera necesita 10,000. Por debajo no se abre y el monto pasa al
 *    Fondo Oportunidad de Mercados Privados; la derivacion la hace el
 *    ensamblador del plan porque cruza clases.
 *  - Cada linea tambien necesita 10,000. Una que no llega no se imprime: su
 *    monto engorda a la mas grande, que en la practica es siempre BTC — el oro
 *    pesa menos del 2% de la clase en todos los perfiles.
 */

import { REGLAS_V8 } from '../domain/reglas.js'

/** Minimo de la clase y de cada linea, en la macro v8. */
export const MIN_OTROS = REGLAS_V8.otros.minUsd

const EPS = 1e-6
const TOL = 0.01

export const OTROS_BTC = 'BTC (IBIT)'
export const OTROS_ORO = 'Oro'

export interface LineaOtros {
  readonly instrumento: string
  readonly usd: number
}

/**
 * Reparte el dinero nuevo de Otros entre BTC y Oro.
 *
 * @param pesos  pesos por instrumento renormalizados dentro de la clase
 * @param minUsd minimo de la clase y de cada linea; sale de la macro
 * @returns `null` cuando el monto no llega al minimo de la clase
 */
export function repartirOtros(
  montoUsd: number,
  pesos: Readonly<Record<string, number>>,
  minUsd = MIN_OTROS,
): LineaOtros[] | null {
  if (montoUsd <= EPS) return null
  if (montoUsd < minUsd - TOL) return null

  const totalPesos = Object.values(pesos).reduce((acc, p) => acc + p, 0)
  if (totalPesos <= EPS) return [{ instrumento: OTROS_BTC, usd: montoUsd }]

  const lineas = Object.entries(pesos)
    .map(([instrumento, peso]) => ({ instrumento, usd: montoUsd * (peso / totalPesos) }))
    .filter((l) => l.usd > EPS)
    .sort((a, b) => b.usd - a.usd)

  // Las que no llegan al minimo se pliegan sobre la mas grande, que ya paso el
  // umbral de la clase. Mejor una linea ejecutable que dos con una muerta.
  const viables = lineas.filter((l) => l.usd >= minUsd - TOL)
  const residuo = lineas
    .filter((l) => l.usd < minUsd - TOL)
    .reduce((acc, l) => acc + l.usd, 0)

  if (viables.length === 0 || viables[0] === undefined) {
    return [{ instrumento: lineas[0]?.instrumento ?? OTROS_BTC, usd: montoUsd }]
  }

  return viables.map((l, i) => (i === 0 ? { ...l, usd: l.usd + residuo } : l))
}
