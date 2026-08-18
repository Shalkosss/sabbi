/**
 * Ensamblado del plan.
 *
 * Es el equivalente de `CalcularAsignacion` de la macro Benchmark Sabbi v8: la
 * rutina que llama a las demas en orden y produce la propuesta. Las piezas ya
 * estan verificadas contra el caso Ana Tumi por separado; aca se encadenan.
 *
 * Orden, que no es arbitrario:
 *
 *  1. Solver de pisos. Reparte el patrimonio entre clases y cierra las que ya
 *     estan cubiertas por lo conservado o por una restriccion.
 *  2. Umbral inmobiliario. Con ticket bajo 500,000 la clase se disuelve y su
 *     capital engorda a las otras tres. Va antes de repartir instrumentos
 *     porque cambia el objetivo de cada clase.
 *  3. Reparto por clase, sobre el dinero nuevo: cascada v8 en Fijo, motor de
 *     nucleo y satelites en Variable, y reglas de familias en Privados — este
 *     ultimo sobre el objetivo de la clase, no sobre el dinero nuevo.
 *  4. Prorrateo de residuales. Barre las lineas inejecutables al final, cuando
 *     ya se sabe cuanto le toco a cada una.
 *
 * La funcion es pura: no lee configuracion, no toca la red y no mira el reloj.
 * Los pesos, los pisos y los toggles llegan como argumento.
 */

import type {
  Benchmark,
  ClaseModelo,
  LineaPlan,
  Perfil,
  Piso,
  ResultadoReparto,
} from './domain/tipos.js'
import { repartirEtfs } from './rules/cascada.js'
import { prorratearInmobiliario, UMBRAL_INMOBILIARIO } from './rules/inmobiliario.js'
import { repartirPrivados } from './rules/privados.js'
import type { PesosPrivados } from './rules/privados.js'
import { repartirPorClase } from './rules/reparto.js'
import { prorratearResiduales } from './rules/residuales.js'
import { repartirVariable } from './rules/variable.js'

const EPS = 1e-6

/** Orden de bloques de la propuesta. Es el de la hoja Data. */
const ORDEN_CLASES: readonly ClaseModelo[] = ['inm', 'fijo', 'variable', 'privados', 'cash']

/** Linea unica de la clase inmobiliaria cuando queda objetivo sin cubrir. */
export const INMOBILIARIO_TBD = 'Inmobiliario Directo — nueva inversión (TBD)'

export const LINEA_CASH = 'Cash'

export interface PesosProductos {
  /** Pesos de los ETFs de Fijo, renormalizados dentro de la clase. */
  readonly fijo: Readonly<Record<string, number>>
  /** Pesos de los ETFs de Variable, renormalizados dentro de la clase. */
  readonly variable: Readonly<Record<string, number>>
  /** Pesos de club y otros, sobre el patrimonio, junto al de la clase. */
  readonly privados: PesosPrivados
}

export interface EntradaPlan {
  readonly perfil: Perfil
  /** Ticket de la propuesta: el patrimonio invertible total. */
  readonly patrimonioTotalUsd: number
  readonly benchmark: Benchmark
  readonly pesos: PesosProductos
  /** Pisos por clase: posiciones conservadas y restricciones del asesor. */
  readonly pisos: readonly Piso[]
  /** Ticket minimo ejecutable de una posicion. */
  readonly ticketMinimoUsd: number
  /** Instrumento de consolidacion cuando una clase no llega a un ticket. */
  readonly fallbacks: { readonly fijo: string; readonly variable: string }
  /** Toggle de flujos. Saca a los fondos mutuos del reparto de privados. */
  readonly necesitaFlujos?: boolean
  /** Conserva Inmobiliario Directo aunque el ticket no llegue a 500,000. */
  readonly inmFijado?: boolean
  readonly clubFijado?: boolean
  readonly otrosFijado?: boolean
}

export interface Plan {
  /** Reparto por clase, ya con el umbral inmobiliario aplicado. */
  readonly reparto: ResultadoReparto
  readonly lineas: readonly LineaPlan[]
  /** Suma de todas las lineas. Debe igualar el patrimonio invertible. */
  readonly totalObjetivoUsd: number
  /** Compras: lo que hay que ejecutar. Objetivo menos lo ya conservado. */
  readonly dineroNuevoUsd: number
  /** Decisiones del motor que el asesor tiene que poder leer. */
  readonly avisos: readonly string[]
}

export function generarPlan(entrada: EntradaPlan): Plan {
  const {
    perfil,
    patrimonioTotalUsd,
    benchmark,
    pesos,
    pisos,
    ticketMinimoUsd,
    fallbacks,
    necesitaFlujos = false,
    inmFijado = false,
    clubFijado = false,
    otrosFijado = false,
  } = entrada

  if (ticketMinimoUsd <= 0) {
    throw new Error(`El ticket minimo debe ser mayor que cero, se recibio ${ticketMinimoUsd}.`)
  }

  const avisos: string[] = []

  const inicial = repartirPorClase(benchmark, patrimonioTotalUsd, pisos)
  const reparto = prorratearInmobiliario(inicial, { patrimonioTotalUsd, inmFijado })

  const inmInicial = claseDe(inicial, 'inm')
  if (patrimonioTotalUsd < UMBRAL_INMOBILIARIO && inmInicial.objetivoUsd > EPS) {
    avisos.push(
      claseDe(reparto, 'inm').objetivoUsd > EPS
        ? `Inmobiliario Directo: ticket bajo ${UMBRAL_INMOBILIARIO.toLocaleString('en-US')} pero conservado por restriccion.`
        : `Inmobiliario Directo: ticket bajo ${UMBRAL_INMOBILIARIO.toLocaleString('en-US')}; su capital se prorrateo a Fijo, Variable y Privados.`,
    )
  }

  if (necesitaFlujos) {
    avisos.push(
      'Flujos activos: los fondos mutuos quedan fuera de Mercados Privados por iliquidos.',
    )
  }

  const privados = claseDe(reparto, 'privados')
  if (privados.pisoUsd > EPS) {
    avisos.push(
      `Mercados Privados conserva ${privados.pisoUsd.toFixed(2)}: el reparto se hace sobre el ` +
        'objetivo de la clase, sin netear por familia. Revisa el bloque antes de publicar.',
    )
  }

  const lineas = ORDEN_CLASES.flatMap((clase) =>
    lineasDeClase(clase, reparto, {
      pisos,
      pesos,
      perfil,
      ticketMinimoUsd,
      fallbacks,
      necesitaFlujos,
      clubFijado,
      otrosFijado,
    }),
  )

  const finales = ordenar(prorratearResiduales(lineas, ticketMinimoUsd))

  return {
    reparto,
    lineas: finales,
    totalObjetivoUsd: finales.reduce((acc, l) => acc + l.usd, 0),
    dineroNuevoUsd: reparto.porClase.reduce((acc, c) => acc + c.dineroNuevoUsd, 0),
    avisos,
  }
}

interface ContextoClase {
  readonly pisos: readonly Piso[]
  readonly pesos: PesosProductos
  readonly perfil: Perfil
  readonly ticketMinimoUsd: number
  readonly fallbacks: { readonly fijo: string; readonly variable: string }
  readonly necesitaFlujos: boolean
  readonly clubFijado: boolean
  readonly otrosFijado: boolean
}

function lineasDeClase(
  clase: ClaseModelo,
  reparto: ResultadoReparto,
  ctx: ContextoClase,
): LineaPlan[] {
  const { objetivoUsd, dineroNuevoUsd } = claseDe(reparto, clase)
  if (objetivoUsd <= EPS) return []

  // Privados reparte el objetivo entero de la clase, no el dinero nuevo: sus
  // familias se calculan sobre el total y por eso no lleva lineas de piso.
  if (clase === 'privados') {
    return repartirPrivados(objetivoUsd, {
      perfil: ctx.perfil,
      pesos: ctx.pesos.privados,
      ticketMinimo: ctx.ticketMinimoUsd,
      clubFijado: ctx.clubFijado,
      otrosFijado: ctx.otrosFijado,
      necesitaFlujos: ctx.necesitaFlujos,
    }).map((l) => ({
      instrumento: l.instrumento,
      clase,
      usd: l.usd,
      residuales: 'reserva' as const,
      ...(l.nota === undefined ? {} : { nota: l.nota }),
    }))
  }

  const conservadas: LineaPlan[] = ctx.pisos
    .filter((p) => p.clase === clase && p.montoUsd > EPS)
    .map((p) => ({ instrumento: p.etiqueta, clase, usd: p.montoUsd, residuales: 'exenta' }))

  if (dineroNuevoUsd <= EPS) return conservadas

  if (clase === 'fijo' || clase === 'variable') {
    const repartir = clase === 'fijo' ? repartirEtfs : repartirVariable
    const nuevas = repartir(ctx.pesos[clase], dineroNuevoUsd, {
      ticketMinimo: ctx.ticketMinimoUsd,
      fallback: ctx.fallbacks[clase],
    }).map((a) => ({ instrumento: a.nombre, clase, usd: a.usd }))
    return [...conservadas, ...nuevas]
  }

  // Cash e inmobiliario quedan fuera del prorrateo de residuales: el cash por
  // la regla de aislamiento de v8, el inmobiliario por ser linea de seccion.
  const instrumento = clase === 'inm' ? INMOBILIARIO_TBD : LINEA_CASH
  return [
    ...conservadas,
    { instrumento, clase, usd: dineroNuevoUsd, residuales: 'exenta' as const },
  ]
}

function claseDe(reparto: ResultadoReparto, clase: ClaseModelo) {
  const encontrada = reparto.porClase.find((c) => c.clase === clase)
  if (!encontrada) {
    throw new Error(`El reparto no trae la clase "${clase}".`)
  }
  return encontrada
}

/** Bloques en el orden de la hoja Data; dentro de cada uno, de mayor a menor. */
function ordenar(lineas: readonly LineaPlan[]): LineaPlan[] {
  return [...lineas].sort((a, b) => {
    const bloque = ORDEN_CLASES.indexOf(a.clase) - ORDEN_CLASES.indexOf(b.clase)
    return bloque !== 0 ? bloque : b.usd - a.usd
  })
}
