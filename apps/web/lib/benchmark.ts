import 'server-only'

import { benchmarkDe, pesosDeClase } from '@sabbi/config'
import { generarPlan, PERFILES } from '@sabbi/core'
import type { ClaseModelo, Perfil, ReglaInmobiliario } from '@sabbi/core'

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

/**
 * Las reglas del portafolio que se pueden cambiar y mirar.
 *
 * No son «la macro» entera: son los tres puntos en los que las dos hojas con
 * las que la mesa venía trabajando no coinciden. Ponerlos acá y no como
 * constantes es lo que permite ver la misma matriz bajo una regla y bajo la
 * otra sin tocar código.
 */
export interface Reglas {
  /** A dónde va el capital de Inmobiliario cuando la clase se disuelve. */
  readonly inmobiliario: ReglaInmobiliario
  /** Debajo de este ticket, Inmobiliario Directo se disuelve. */
  readonly umbralInmobiliarioUsd: number
  /** Monto mínimo para que una línea de ETF sea ejecutable. */
  readonly ticketEtfUsd: number
}

/**
 * La macro v8: la que el motor reproduce y la que fija el golden test.
 *
 * Es el punto de partida de la vista. Cambiar cualquiera de los tres valores
 * la aleja de lo que la propuesta produce de verdad, y por eso la pantalla lo
 * dice cuando pasa.
 */
export const REGLAS_V8: Reglas = {
  inmobiliario: 'prorratear',
  umbralInmobiliarioUsd: 500_000,
  ticketEtfUsd: 20_000,
}

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
  /** Con qué reglas se corrió esta matriz. */
  readonly reglas: Reglas
  /** `true` cuando son las de la macro v8, que es lo que produce la propuesta. */
  readonly esLaMacroDeLaPropuesta: boolean
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
function correr(ticketUsd: number, perfil: Perfil, reglas: Reglas): Portafolio {
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
    ticketMinimoUsd: reglas.ticketEtfUsd,
    fallbacks: FALLBACKS,
    reglaInmobiliario: reglas.inmobiliario,
    umbralInmobiliarioUsd: reglas.umbralInmobiliarioUsd,
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

/** Los veinte portafolios: cada ticket contra cada perfil, con estas reglas. */
export function matrizDeBenchmark(reglas: Reglas = REGLAS_V8): Matriz {
  return {
    portafolios: TICKETS.flatMap((ticket) =>
      PERFILES.map((perfil) => correr(ticket, perfil, reglas)),
    ),
    tickets: TICKETS,
    perfiles: [...PERFILES],
    reglas,
    esLaMacroDeLaPropuesta:
      reglas.inmobiliario === REGLAS_V8.inmobiliario &&
      reglas.umbralInmobiliarioUsd === REGLAS_V8.umbralInmobiliarioUsd &&
      reglas.ticketEtfUsd === REGLAS_V8.ticketEtfUsd,
  }
}

/** Lee las reglas de la URL, cayendo en las de la v8 ante cualquier duda. */
export function reglasDeLaUrl(parametros: Record<string, string | string[] | undefined>): Reglas {
  const numero = (clave: string, porDefecto: number) => {
    const crudo = parametros[clave]
    const valor = Number(Array.isArray(crudo) ? crudo[0] : crudo)
    return Number.isFinite(valor) && valor > 0 ? valor : porDefecto
  }

  return {
    inmobiliario: parametros['inm'] === 'alternativos' ? 'alternativos' : 'prorratear',
    umbralInmobiliarioUsd: numero('umbral', REGLAS_V8.umbralInmobiliarioUsd),
    ticketEtfUsd: numero('etf', REGLAS_V8.ticketEtfUsd),
  }
}
