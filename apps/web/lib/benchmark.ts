import 'server-only'

import { benchmarkDe, pesosDeClase } from '@sabbi/config'
import { generarPlan, PERFILES, UMBRAL_INMOBILIARIO } from '@sabbi/core'
import type { ClaseModelo, Perfil } from '@sabbi/core'

import { FALLBACKS } from './catalogo'

/**
 * El universo del motor: cada ticket contra cada perfil.
 *
 * No es una propuesta de nadie. Es el motor corrido en vacío —sin ficha, sin
 * posiciones conservadas, sin ajustes— para ver qué produce el modelo con un
 * cliente que llega con dinero y nada más. Sirve para mirar las reglas de la
 * macro de frente: cuáles abren, cuáles no llegan a su mínimo y a dónde va lo
 * que queda cuando no llega.
 *
 * Se corre en el servidor por la razón de siempre: los pesos del benchmark son
 * el modelo Sabbi y no bajan al navegador. Lo que baja son veinte portafolios
 * ya calculados.
 *
 * Es una función pura envuelta en una lectura de configuración, así que dos
 * cargas de la página dan exactamente lo mismo mientras la configuración no
 * cambie. Cuando la mesa toque los pesos, esta vista lo muestra sin que nadie
 * tenga que subir una ficha de prueba.
 */

/** Los tickets que la mesa quiere mirar, en dólares. */
export const TICKETS: readonly number[] = [25_000, 50_000, 75_000, 100_000]

/** El ticket mínimo de ETF con el que se corre la matriz. El default del motor. */
export const TICKET_ETF = 20_000

export interface LineaBenchmark {
  readonly instrumento: string
  readonly clase: ClaseModelo
  readonly usd: number
  readonly share: number
}

export interface Portafolio {
  readonly ticketUsd: number
  readonly perfil: Perfil
  /** Monto por clase, en el orden del motor. */
  readonly porClase: Readonly<Record<ClaseModelo, number>>
  readonly lineas: readonly LineaBenchmark[]
  /** Lo que el motor decidió y hay que poder leer: mínimos, derivaciones. */
  readonly avisos: readonly string[]
  /** Suma de las líneas. Tiene que ser el ticket. */
  readonly totalUsd: number
}

export interface Matriz {
  readonly portafolios: readonly Portafolio[]
  readonly tickets: readonly number[]
  readonly perfiles: readonly Perfil[]
  /**
   * El umbral bajo el cual Inmobiliario Directo se disuelve.
   *
   * Los cuatro tickets están por debajo, así que en las veinte corridas la
   * clase se disuelve y su capital se prorratea. Es la regla que más mueve las
   * cifras de esta matriz y conviene que esté dicha, no deducida.
   */
  readonly umbralInmobiliario: number
  readonly ticketEtf: number
}

const CLASES_VACIAS: Readonly<Record<ClaseModelo, number>> = {
  inm: 0,
  fijo: 0,
  variable: 0,
  privados: 0,
  club: 0,
  otros: 0,
  cash: 0,
}

/** Un portafolio del universo: un ticket, un perfil, el motor en vacío. */
function correr(ticketUsd: number, perfil: Perfil): Portafolio {
  const plan = generarPlan({
    perfil,
    patrimonioTotalUsd: ticketUsd,
    benchmark: benchmarkDe(perfil),
    pesos: {
      fijo: pesosDeClase('fijo', perfil),
      variable: pesosDeClase('variable', perfil),
      otros: pesosDeClase('otros', perfil),
    },
    // Sin pisos: es un cliente que llega con dinero y nada mas. Esa es la
    // condicion que deja ver el modelo sin nada encima.
    pisos: [],
    ticketMinimoUsd: TICKET_ETF,
    fallbacks: FALLBACKS,
  })

  const porClase = { ...CLASES_VACIAS }
  for (const clase of plan.reparto.porClase) {
    porClase[clase.clase] = clase.objetivoUsd
  }

  return {
    ticketUsd,
    perfil,
    porClase,
    lineas: plan.lineas.map((linea) => ({
      instrumento: linea.instrumento,
      clase: linea.clase,
      usd: linea.usd,
      share: plan.totalObjetivoUsd > 0 ? linea.usd / plan.totalObjetivoUsd : 0,
    })),
    avisos: plan.avisos,
    totalUsd: plan.totalObjetivoUsd,
  }
}

/** Los veinte portafolios: cada ticket contra cada perfil. */
export function matrizDeBenchmark(): Matriz {
  return {
    portafolios: TICKETS.flatMap((ticket) => PERFILES.map((perfil) => correr(ticket, perfil))),
    tickets: TICKETS,
    perfiles: [...PERFILES],
    umbralInmobiliario: UMBRAL_INMOBILIARIO,
    ticketEtf: TICKET_ETF,
  }
}
