/**
 * Reparto de Club Deals.
 *
 * Hasta la config v3 el club era una familia interna de Mercados Privados;
 * ahora es clase propia, con su peso de benchmark en la hoja Allocation
 * detallado. La regla de instrumentos es la misma de siempre:
 *
 *  - Minimo de 10,000. Por debajo la clase no se abre y el monto pasa al
 *    Fondo Oportunidad de Mercados Privados — esa derivacion la hace el
 *    ensamblador del plan, no esta rutina, porque cruza clases.
 *  - Con flujos activos el destino es Sabbi Fondo Estrategico, el unico
 *    producto de la familia que distribuye (trimestral, 8.25%).
 *  - Sin flujos, el fondo Edifica: Clase A desde 70,000, Clase B por debajo.
 */

import { REGLAS_V8 } from '../domain/reglas.js'

/** Minimo para que Club Deals se abra como linea propia, en la macro v8. */
export const MIN_CLUB = REGLAS_V8.club.minUsd

/** Frontera entre las dos clases del fondo Edifica, en la macro v8. */
export const UMBRAL_CLASE_A = REGLAS_V8.club.umbralClaseAUsd

const EPS = 1e-6
const TOL = 0.01

/** Unico producto de la familia club que paga flujos. Trimestral, 8.25%. */
export const FONDO_ESTRATEGICO = 'Sabbi Fondo Estratégico'

export interface LineaClub {
  readonly instrumento: string
  readonly usd: number
}

export interface OpcionesClub {
  readonly necesitaFlujos?: boolean
  /** Minimo de la clase. Sale de la macro; por defecto, el de la v8. */
  readonly minUsd?: number
  /** Frontera Edifica A / B. Sale de la macro; por defecto, la de la v8. */
  readonly umbralClaseAUsd?: number
}

/**
 * Nombre de la clase del fondo Edifica segun el monto.
 *
 * Con Ana Tumi el club queda en 67,979 y por eso la propuesta dice Clase B.
 */
export function etiquetaClubDeal(montoUsd: number, umbralClaseAUsd = UMBRAL_CLASE_A): string {
  return montoUsd >= umbralClaseAUsd
    ? 'Fondo Edifica Diversificado Clase A'
    : 'Fondo Edifica Diversificado Clase B'
}

/**
 * Reparte el dinero nuevo de Club Deals.
 *
 * Devuelve `null` cuando el monto no llega al minimo de la clase: es la señal
 * para que el ensamblador lo derive al Fondo Oportunidad en lugar de imprimir
 * una linea inejecutable.
 */
export function repartirClub(montoUsd: number, opciones: OpcionesClub = {}): LineaClub | null {
  const {
    necesitaFlujos = false,
    minUsd = MIN_CLUB,
    umbralClaseAUsd = UMBRAL_CLASE_A,
  } = opciones
  if (montoUsd <= EPS) return null
  if (montoUsd < minUsd - TOL) return null

  // Con flujos activos el club no va a Edifica: Sabbi Fondo Estrategico es el
  // unico de la familia que distribuye.
  const instrumento = necesitaFlujos
    ? FONDO_ESTRATEGICO
    : etiquetaClubDeal(montoUsd, umbralClaseAUsd)
  return { instrumento, usd: montoUsd }
}
