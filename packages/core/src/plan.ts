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
 *     estan cubiertas por lo conservado o por una restriccion. Desde que Club
 *     Deals y Otros son clases propias, este paso tambien hace el neteo por
 *     familia que el motor viejo resolvia a mano dentro de privados.
 *  2. Umbral inmobiliario. Con ticket bajo 500,000 la clase se disuelve y su
 *     capital engorda a las otras. Va antes de repartir instrumentos porque
 *     cambia el objetivo de cada clase.
 *  3. Derivacion de residuos. Un Club Deals bajo 10,000 o un Otros bajo su
 *     minimo no imprimen lineas inejecutables: su dinero nuevo pasa al Fondo
 *     Oportunidad de Mercados Privados, que no tiene minimo de inversion.
 *  4. Reparto por clase, sobre el dinero nuevo: cascada v8 en Fijo, motor de
 *     nucleo y satelites en Variable, familia de fondos en Privados, Edifica o
 *     Estrategico en Club, BTC y Oro en Otros.
 *  5. Prorrateo de residuales. Barre las lineas inejecutables al final, cuando
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
  RepartoClase,
  ResultadoReparto,
} from './domain/tipos.js'
import { repartirEtfs } from './rules/cascada.js'
import { repartirClub, MIN_CLUB } from './rules/club.js'
import { prorratearInmobiliario, UMBRAL_INMOBILIARIO } from './rules/inmobiliario.js'
import type { EstadoInstitucional } from './rules/institucional.js'
import { repartirOtros, MIN_OTROS } from './rules/otros.js'
import { repartirPrivados, FONDO_OPORTUNIDAD } from './rules/privados.js'
import { repartirPorClase } from './rules/reparto.js'
import { prorratearResiduales } from './rules/residuales.js'
import { repartirVariable } from './rules/variable.js'

const EPS = 1e-6

/** Orden de bloques de la propuesta. Es el de la hoja Allocation detallado. */
const ORDEN_CLASES: readonly ClaseModelo[] = [
  'inm',
  'fijo',
  'variable',
  'privados',
  'club',
  'otros',
  'cash',
]

/** Linea unica de la clase inmobiliaria cuando queda objetivo sin cubrir. */
export const INMOBILIARIO_TBD = 'Inmobiliario Directo — nueva inversión (TBD)'

export const LINEA_CASH = 'Cash'

export interface PesosProductos {
  /** Pesos de los ETFs de Fijo, renormalizados dentro de la clase. */
  readonly fijo: Readonly<Record<string, number>>
  /** Pesos de los ETFs de Variable, renormalizados dentro de la clase. */
  readonly variable: Readonly<Record<string, number>>
  /** Pesos de BTC y Oro, renormalizados dentro de la clase Otros. */
  readonly otros: Readonly<Record<string, number>>
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
  /**
   * Check institucional. `auto` reproduce v8 — split abierto con la nota al
   * pie —; solo un forzado del asesor cambia el reparto.
   */
  readonly institucional?: EstadoInstitucional
  /** Conserva Inmobiliario Directo aunque el ticket no llegue a 500,000. */
  readonly inmFijado?: boolean
}

export interface Plan {
  /** Reparto por clase, con el umbral inmobiliario y los residuos aplicados. */
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
    institucional = 'auto',
    inmFijado = false,
  } = entrada

  if (ticketMinimoUsd <= 0) {
    throw new Error(`El ticket minimo debe ser mayor que cero, se recibio ${ticketMinimoUsd}.`)
  }

  const avisos: string[] = []

  const inicial = repartirPorClase(benchmark, patrimonioTotalUsd, pisos)
  const conInmobiliario = prorratearInmobiliario(inicial, { patrimonioTotalUsd, inmFijado })

  const inmInicial = claseDe(inicial, 'inm')
  if (patrimonioTotalUsd < UMBRAL_INMOBILIARIO && inmInicial.objetivoUsd > EPS) {
    avisos.push(
      claseDe(conInmobiliario, 'inm').objetivoUsd > EPS
        ? `Inmobiliario Directo: ticket bajo ${UMBRAL_INMOBILIARIO.toLocaleString('en-US')} pero conservado por restriccion.`
        : `Inmobiliario Directo: ticket bajo ${UMBRAL_INMOBILIARIO.toLocaleString('en-US')}; su capital se prorrateo a las clases invertibles.`,
    )
  }

  if (necesitaFlujos) {
    avisos.push(
      'Flujos activos: los fondos mutuos quedan fuera de Mercados Privados por iliquidos.',
    )
  }

  // El automatico no se avisa: es lo que el motor hace siempre. Un forzado si,
  // porque cambia el reparto respecto de la referencia.
  if (institucional === 'no') {
    avisos.push(
      'Check institucional forzado a no: los fondos mutuos no se abren y su capital queda ' +
        'en el Fondo Oportunidad.',
    )
  } else if (institucional === 'si') {
    avisos.push(
      'Check institucional forzado a si: los fondos mutuos se abren sin la nota de ' +
        'disponibilidad.',
    )
  }

  // Los montos que no llegan al minimo de su clase van al Fondo Oportunidad,
  // que no tiene minimo. El reparto se ajusta para que cada clase siga
  // cuadrando contra sus lineas.
  const club = repartirClub(claseDe(conInmobiliario, 'club').dineroNuevoUsd, { necesitaFlujos })
  const otros = repartirOtros(claseDe(conInmobiliario, 'otros').dineroNuevoUsd, pesos.otros)

  const residuoClub = club === null ? claseDe(conInmobiliario, 'club').dineroNuevoUsd : 0
  const residuoOtros = otros === null ? claseDe(conInmobiliario, 'otros').dineroNuevoUsd : 0

  if (residuoClub > EPS) {
    avisos.push(
      `Club Deals: el dinero nuevo (${residuoClub.toFixed(2)}) no llega al minimo de ` +
        `${MIN_CLUB.toLocaleString('en-US')} y pasa al ${FONDO_OPORTUNIDAD}.`,
    )
  }
  if (residuoOtros > EPS) {
    avisos.push(
      `Otros: el dinero nuevo (${residuoOtros.toFixed(2)}) no llega al minimo de ` +
        `${MIN_OTROS.toLocaleString('en-US')} y pasa al ${FONDO_OPORTUNIDAD}.`,
    )
  }

  const reparto = derivarResiduos(conInmobiliario, residuoClub, residuoOtros)

  const lineas = ORDEN_CLASES.flatMap((clase) =>
    lineasDeClase(clase, reparto, {
      pisos,
      pesos,
      perfil,
      ticketMinimoUsd,
      fallbacks,
      necesitaFlujos,
      institucional,
      club,
      otros,
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

/**
 * Mueve el dinero nuevo de Club y Otros que no abrio hacia Privados.
 *
 * Ajusta el reparto — no solo las lineas — para que el objetivo de cada clase
 * siga siendo la suma de sus lineas. El total no cambia: es el mismo dinero
 * contado en otra clase.
 */
function derivarResiduos(
  reparto: ResultadoReparto,
  residuoClub: number,
  residuoOtros: number,
): ResultadoReparto {
  const residuo = residuoClub + residuoOtros
  if (residuo <= EPS) return reparto

  const porClase: RepartoClase[] = reparto.porClase.map((c) => {
    if (c.clase === 'club' && residuoClub > EPS) {
      return {
        ...c,
        objetivoUsd: c.objetivoUsd - residuoClub,
        dineroNuevoUsd: 0,
        cerrada: true,
      }
    }
    if (c.clase === 'otros' && residuoOtros > EPS) {
      return {
        ...c,
        objetivoUsd: c.objetivoUsd - residuoOtros,
        dineroNuevoUsd: 0,
        cerrada: true,
      }
    }
    if (c.clase === 'privados') {
      return {
        ...c,
        objetivoUsd: c.objetivoUsd + residuo,
        dineroNuevoUsd: c.dineroNuevoUsd + residuo,
      }
    }
    return c
  })

  return { ...reparto, porClase }
}

interface ContextoClase {
  readonly pisos: readonly Piso[]
  readonly pesos: PesosProductos
  readonly perfil: Perfil
  readonly ticketMinimoUsd: number
  readonly fallbacks: { readonly fijo: string; readonly variable: string }
  readonly necesitaFlujos: boolean
  readonly institucional: EstadoInstitucional
  /** Resultado de `repartirClub`, ya evaluado para derivar residuos. */
  readonly club: ReturnType<typeof repartirClub>
  /** Resultado de `repartirOtros`, ya evaluado para derivar residuos. */
  readonly otros: ReturnType<typeof repartirOtros>
}

function lineasDeClase(
  clase: ClaseModelo,
  reparto: ResultadoReparto,
  ctx: ContextoClase,
): LineaPlan[] {
  const { objetivoUsd, dineroNuevoUsd } = claseDe(reparto, clase)
  if (objetivoUsd <= EPS) return []

  const conservadas: LineaPlan[] = ctx.pisos
    .filter((p) => p.clase === clase && p.montoUsd > EPS)
    .map((p) => ({ instrumento: p.etiqueta, clase, usd: p.montoUsd, residuales: 'exenta' }))

  if (dineroNuevoUsd <= EPS) return conservadas

  // Privados, Club y Otros resuelven sus minimos propios: sus lineas nuevas no
  // ceden en el prorrateo de residuales y solo reciben en ultima instancia.
  if (clase === 'privados') {
    const nuevas = repartirPrivados(dineroNuevoUsd, {
      perfil: ctx.perfil,
      necesitaFlujos: ctx.necesitaFlujos,
      institucional: ctx.institucional,
    }).map(
      (l): LineaPlan => ({
        instrumento: l.instrumento,
        clase,
        usd: l.usd,
        residuales: 'reserva',
        ...(l.nota === undefined ? {} : { nota: l.nota }),
      }),
    )
    return [...conservadas, ...nuevas]
  }

  if (clase === 'club') {
    const nuevas: LineaPlan[] =
      ctx.club === null
        ? []
        : [{ instrumento: ctx.club.instrumento, clase, usd: ctx.club.usd, residuales: 'reserva' }]
    return [...conservadas, ...nuevas]
  }

  if (clase === 'otros') {
    const nuevas: LineaPlan[] = (ctx.otros ?? []).map((l) => ({
      instrumento: l.instrumento,
      clase,
      usd: l.usd,
      residuales: 'reserva' as const,
    }))
    return [...conservadas, ...nuevas]
  }

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

/** Bloques en el orden de la hoja; dentro de cada uno, de mayor a menor. */
function ordenar(lineas: readonly LineaPlan[]): LineaPlan[] {
  return [...lineas].sort((a, b) => {
    const bloque = ORDEN_CLASES.indexOf(a.clase) - ORDEN_CLASES.indexOf(b.clase)
    return bloque !== 0 ? bloque : b.usd - a.usd
  })
}
