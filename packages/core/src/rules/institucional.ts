/**
 * Check institucional.
 *
 * Un cliente grande accede a los fondos mutuos de Sabbi — RE & Infrastructure,
 * Private Credit y PE & VC. Son iliquidos y estan reservados a inversionistas
 * institucionales, asi que el umbral es regulatorio antes que comercial.
 *
 * La sutileza esta en quien decide. El motor canonico v8 no evalua el umbral:
 * siempre abre el split en los tres fondos y estampa una nota al pie que
 * traslada la decision al asesor. Por eso la propuesta de Ana Tumi muestra los
 * FM aunque su patrimonio no llegue a ninguno de los dos umbrales.
 *
 * Este modulo separa las dos cosas que estaban confundidas:
 *
 *  - `evaluarSenalInstitucional` calcula la formula del §4.1 y devuelve una
 *    senal informativa. Nadie la usa como compuerta.
 *  - `aperturaFm` traduce el estado de tres posiciones que el asesor controla
 *    en la propuesta — el campo `institucional_override` de la base — a lo que
 *    el reparto de privados tiene que hacer.
 *
 * En `auto` el comportamiento es el de v8 al centavo. Solo un forzado manual
 * cambia el reparto, y queda en la bitacora.
 */

import type { ClaseModelo } from '../domain/tipos.js'

/** Tipo de cambio institucional PEN/USD. Fijo, no es el FX de la propuesta. */
export const FX_INSTITUCIONAL = 3.4

/** 2,500,000 PEN de patrimonio invertible. */
export const INST_INVERTIBLE_USD = 2_500_000 / FX_INSTITUCIONAL

/** 4,600,000 PEN de patrimonio total. */
export const INST_TOTAL_USD = 4_600_000 / FX_INSTITUCIONAL

/**
 * Clases que no cuentan como patrimonio invertible.
 *
 * El inmobiliario directo no se liquida para suscribir un fondo, asi que suma
 * al total pero no al invertible.
 */
const CLASES_NO_INVERTIBLES: readonly ClaseModelo[] = ['inm']

/** Estado del check en la propuesta. Espeja `institucional_override`. */
export type EstadoInstitucional = 'auto' | 'si' | 'no'

/** Lo que el reparto de privados hace con los tres fondos institucionales. */
export type AperturaFm = 'con-nota' | 'sin-nota' | 'cerrada'

/** Lo minimo que hace falta de una posicion para evaluar el umbral. */
export interface PosicionValorizada {
  readonly claseModelo: ClaseModelo
  readonly valorUsd: number
  /** Un inmueble de uso propio queda fuera del calculo entero. */
  readonly esInvertible: boolean
}

export interface SenalInstitucional {
  /** Patrimonio total, sin lo de uso propio. */
  readonly totalUsd: number
  /** Total menos las clases no invertibles. */
  readonly invertibleUsd: number
  /** Resultado de la formula. Es una senal, no una compuerta. */
  readonly cumple: boolean
}

/**
 * Evalua la formula del §4.1 sobre las posiciones de la ficha.
 *
 * Los dos umbrales son conjuntivos: hacen falta los dos.
 */
export function evaluarSenalInstitucional(
  posiciones: readonly PosicionValorizada[],
): SenalInstitucional {
  const cuentan = posiciones.filter((p) => p.esInvertible)
  const totalUsd = cuentan.reduce((acc, p) => acc + p.valorUsd, 0)
  const invertibleUsd = cuentan
    .filter((p) => !CLASES_NO_INVERTIBLES.includes(p.claseModelo))
    .reduce((acc, p) => acc + p.valorUsd, 0)

  return {
    totalUsd,
    invertibleUsd,
    cumple: invertibleUsd >= INST_INVERTIBLE_USD && totalUsd >= INST_TOTAL_USD,
  }
}

/**
 * Traduce el estado del check a lo que el reparto tiene que hacer.
 *
 * `auto` reproduce v8: abre el split y estampa el disclaimer. `si` lo abre
 * limpio porque el asesor ya confirmo que el cliente califica. `no` lo cierra
 * y deja todo en el Fondo Oportunidad.
 */
export function aperturaFm(estado: EstadoInstitucional): AperturaFm {
  switch (estado) {
    case 'si':
      return 'sin-nota'
    case 'no':
      return 'cerrada'
    default:
      return 'con-nota'
  }
}
