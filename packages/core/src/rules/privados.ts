/**
 * Reparto de Mercados Privados.
 *
 * Desde la separacion de Club Deals y Otros en clases propias, esta clase es
 * solo la familia de fondos: los tres fondos mutuos institucionales y el Fondo
 * Oportunidad. El neteo contra lo conservado ya no vive aca — lo hace el
 * solver de pisos, clase por clase — asi que esta rutina recibe el dinero
 * nuevo y decide en que fondos entra.
 *
 * Las reglas, en orden:
 *
 *  - Flujos mandan. Los fondos mutuos no distribuyen; con el toggle activo el
 *    destino es Vision Dividendos Global si alcanza su ticket de 80,000, y el
 *    Fondo Oportunidad si no.
 *  - Check institucional. `auto` reproduce v8: abre el split en los tres FM y
 *    estampa la nota que traslada la decision al asesor. Solo un forzado a
 *    `no` lo cierra.
 *  - Todo o nada. Si algun subfondo activo no llega a 50,000, no se abre
 *    ninguno: todo va al Fondo Oportunidad. Media apertura no existe.
 *
 * El Fondo Oportunidad no tiene minimo de inversion: es el destino residual de
 * la clase y de los montos de Club Deals y Otros que no llegan a su umbral.
 */

import { REGLAS_V8 } from '../domain/reglas.js'
import type { Perfil } from '../domain/tipos.js'
import { aperturaFm } from './institucional.js'
import type { EstadoInstitucional } from './institucional.js'

/** Minimo por subfondo institucional en la macro v8. */
export const MIN_SUBFONDO = REGLAS_V8.privados.minSubfondoUsd

/**
 * Ticket minimo de Vision Dividendos Global (Clase B, §4.7) en la macro v8.
 *
 * Debajo de esto el destino de flujos no es viable y el monto se queda en el
 * Fondo Oportunidad.
 */
export const MIN_DIVIDENDOS_GLOBAL = REGLAS_V8.privados.minDividendosGlobalUsd

const EPS = 1e-6
const TOL = 0.01

export const FONDO_OPORTUNIDAD = 'Sabbi Fondo Oportunidad'
export const FONDO_RE_INFRA = 'FM RE Infra'
export const FONDO_PRIVATE_CREDIT = 'FM PC'
export const FONDO_PE_VC = 'FM PE VC'

/** Destino de flujos de la clase. Mensual, 6.65% o 7.25%. */
export const FONDO_DIVIDENDOS_GLOBAL = 'Fondo Visión Dividendos Global'

/**
 * Nota que arrastra todo fondo institucional.
 *
 * En automatico el motor no usa el umbral como compuerta: abre el split y
 * estampa la nota, que traslada la decision al asesor. Solo un forzado manual
 * la saca — o cierra el split entero.
 */
export const NOTA_INSTITUCIONAL =
  'Disponible solo para clientes Institucionales; caso contrario, asignar a Sabbi Fondo Oportunidad.'

export interface LineaPrivados {
  readonly instrumento: string
  readonly usd: number
  readonly nota?: string
}

export interface OpcionesPrivados {
  readonly perfil: Perfil
  /**
   * Toggle de flujos de la propuesta. Con el activo ningun fondo mutuo recibe
   * dinero: los FM son iliquidos y no distribuyen.
   */
  readonly necesitaFlujos?: boolean
  /**
   * Check institucional de la propuesta. Por defecto `auto`, que reproduce v8.
   * Gana el toggle de flujos: forzar `si` no vuelve liquidos a los FM.
   */
  readonly institucional?: EstadoInstitucional
  /** Minimo por subfondo. Sale de la macro; por defecto, el de la v8. */
  readonly minSubfondoUsd?: number
  /** Ticket de Vision Dividendos Global. Sale de la macro. */
  readonly minDividendosGlobalUsd?: number
}

/** Split del Fondo Oportunidad entre los tres institucionales, por perfil. */
function splitInstitucional(perfil: Perfil): { reInfra: number; pc: number; pevc: number } {
  return perfil === 'Arriesgado'
    ? { reInfra: 0, pc: 0.3, pevc: 0.7 }
    : { reInfra: 0.5, pc: 0.5, pevc: 0 }
}

/**
 * Linea unica de la clase, sin abrir subfondos.
 *
 * Con flujos activos el destino es Vision Dividendos Global mientras alcance su
 * ticket; por debajo se queda en el Fondo Oportunidad. Son los dos unicos
 * destinos posibles cuando el cliente necesita flujos.
 */
function lineaOportunidad(
  montoUsd: number,
  necesitaFlujos: boolean,
  minDividendosGlobalUsd: number,
): LineaPrivados {
  const instrumento =
    necesitaFlujos && montoUsd >= minDividendosGlobalUsd - TOL
      ? FONDO_DIVIDENDOS_GLOBAL
      : FONDO_OPORTUNIDAD
  return { instrumento, usd: montoUsd }
}

/**
 * Reparte el dinero nuevo de Mercados Privados entre sus fondos.
 *
 * Tres compuertas, en orden. Los flujos mandan: con el toggle activo los FM
 * quedan fuera por iliquidos y el split ni se evalua. Despues el check
 * institucional, que solo cierra si el asesor lo forzo a `no`. Y al final la
 * regla de todo o nada: basta con que un subfondo activo no llegue a 50,000
 * para que no se abra ninguno.
 */
export function repartirPrivados(
  montoUsd: number,
  opciones: OpcionesPrivados,
): LineaPrivados[] {
  const {
    perfil,
    necesitaFlujos = false,
    institucional = 'auto',
    minSubfondoUsd = MIN_SUBFONDO,
    minDividendosGlobalUsd = MIN_DIVIDENDOS_GLOBAL,
  } = opciones
  if (montoUsd <= EPS) return []

  // Los FM no distribuyen. Con flujos activos el split ni se evalua.
  if (necesitaFlujos) return [lineaOportunidad(montoUsd, true, minDividendosGlobalUsd)]

  const apertura = aperturaFm(institucional)
  if (apertura === 'cerrada') {
    return [lineaOportunidad(montoUsd, false, minDividendosGlobalUsd)]
  }

  const split = splitInstitucional(perfil)
  const candidatos = [
    { instrumento: FONDO_RE_INFRA, usd: montoUsd * split.reInfra },
    { instrumento: FONDO_PRIVATE_CREDIT, usd: montoUsd * split.pc },
    { instrumento: FONDO_PE_VC, usd: montoUsd * split.pevc },
  ].filter((c) => c.usd > EPS)

  const todosPasan =
    candidatos.length > 0 && candidatos.every((c) => c.usd >= minSubfondoUsd - TOL)

  if (!todosPasan) {
    return [lineaOportunidad(montoUsd, false, minDividendosGlobalUsd)]
  }

  return candidatos.map((c) => ({
    instrumento: c.instrumento,
    usd: c.usd,
    // Confirmado por el asesor, el disclaimer sobra.
    ...(apertura === 'con-nota' ? { nota: NOTA_INSTITUCIONAL } : {}),
  }))
}
