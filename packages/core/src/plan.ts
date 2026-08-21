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
 *  2. Umbral inmobiliario. Bajo el ticket que fija la macro —500,000 en la v8—
 *     la clase se disuelve y su capital engorda a las otras. Va antes de
 *     repartir instrumentos porque cambia el objetivo de cada clase.
 *  3. Derivacion de residuos. Un Club Deals o un Otros por debajo de su minimo
 *     no imprimen lineas inejecutables: su dinero nuevo pasa al Fondo
 *     Oportunidad de Mercados Privados, que no tiene minimo de inversion.
 *  4. Reparto por clase, sobre el dinero nuevo: cascada v8 en Fijo, motor de
 *     nucleo y satelites en Variable, familia de fondos en Privados, Edifica o
 *     Estrategico en Club, BTC y Oro en Otros.
 *  5. Prorrateo de residuales. Barre las lineas inejecutables al final, cuando
 *     ya se sabe cuanto le toco a cada una.
 *
 * La funcion es pura: no lee configuracion, no toca la red y no mira el reloj.
 * Los pesos, los pisos, los toggles y la macro —los umbrales con los que se
 * decide— llegan como argumento. Sin macro corre la v8, que es la que fija el
 * golden test de Ana Tumi.
 */

import { REGLAS_V8 } from './domain/reglas.js'
import type { ReglasMotor } from './domain/reglas.js'
import type {
  AjusteAplicado,
  AjusteClase,
  Benchmark,
  ClaseModelo,
  LineaPlan,
  Perfil,
  Piso,
  RepartoClase,
  ResultadoReparto,
} from './domain/tipos.js'
import { NOMBRE_CLASE } from './domain/tipos.js'
import { repartirEtfs } from './rules/cascada.js'
import { repartirClub } from './rules/club.js'
import { prorratearInmobiliario } from './rules/inmobiliario.js'
import type { EstadoInstitucional } from './rules/institucional.js'
import { repartirOtros } from './rules/otros.js'
import { repartirPrivados, FONDO_OPORTUNIDAD } from './rules/privados.js'
import { repartirPorClase } from './rules/reparto.js'
import { prorratearResiduales } from './rules/residuales.js'
import { repartirVariable } from './rules/variable.js'

const EPS = 1e-6

/** Un centavo. Por debajo, una diferencia es ruido de coma flotante. */
const TOL = 0.01

/** Clases que pueden absorber el residuo de Club y Otros, en orden de preferencia. */
const CANDIDATAS_RESIDUO: readonly ClaseModelo[] = ['privados', 'cash', 'fijo', 'variable']

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
  /**
   * Montos que el asesor clavo por clase, en las dos direcciones.
   *
   * Un piso solo empuja hacia arriba; un ajuste tambien hacia abajo. La clase
   * ajustada sale del reparto y lo que sobra se prorratea entre las demas.
   */
  readonly ajustes?: readonly AjusteClase[]
  /**
   * La macro: los umbrales y minimos con los que se calcula.
   *
   * Es lo que la mesa edita en la pantalla de Macro y lo que hace que dos
   * corridas del mismo cliente den portafolios distintos. Sin ella manda la
   * v8, que es la que fija el golden test de Ana Tumi.
   *
   * `ticketMinimoUsd` viaja aparte y gana: es el unico numero de la macro que
   * el asesor puede mover propuesta por propuesta.
   */
  readonly reglas?: ReglasMotor
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
    ajustes = [],
    reglas = REGLAS_V8,
  } = entrada

  const { destino: reglaInmobiliario, umbralUsd: umbralInmobiliarioUsd } = reglas.inmobiliario

  if (ticketMinimoUsd <= 0) {
    throw new Error(`El ticket minimo debe ser mayor que cero, se recibio ${ticketMinimoUsd}.`)
  }

  const avisos: string[] = []

  const inicial = repartirPorClase(benchmark, patrimonioTotalUsd, pisos, ajustes)
  const conInmobiliario = prorratearInmobiliario(inicial, {
    patrimonioTotalUsd,
    inmFijado,
    regla: reglaInmobiliario,
    umbralUsd: umbralInmobiliarioUsd,
  })

  avisos.push(...avisosDeAjustes(inicial.ajustes))

  const inmInicial = claseDe(inicial, 'inm')
  if (patrimonioTotalUsd < umbralInmobiliarioUsd && inmInicial.objetivoUsd > EPS) {
    const umbral = umbralInmobiliarioUsd.toLocaleString('en-US')
    const adonde =
      reglaInmobiliario === 'alternativos'
        ? 'su capital paso entero al bloque de Privados, Club y Otros'
        : 'su capital se prorrateo entre las clases invertibles'

    avisos.push(
      claseDe(conInmobiliario, 'inm').objetivoUsd > EPS
        ? `Inmobiliario Directo: ticket bajo ${umbral} pero conservado por restriccion.`
        : `Inmobiliario Directo: ticket bajo ${umbral}; ${adonde}.`,
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
  const club = repartirClub(claseDe(conInmobiliario, 'club').dineroNuevoUsd, {
    necesitaFlujos,
    minUsd: reglas.club.minUsd,
    umbralClaseAUsd: reglas.club.umbralClaseAUsd,
  })
  const otros = repartirOtros(
    claseDe(conInmobiliario, 'otros').dineroNuevoUsd,
    pesos.otros,
    reglas.otros.minUsd,
  )

  const residuoClub = club === null ? claseDe(conInmobiliario, 'club').dineroNuevoUsd : 0
  const residuoOtros = otros === null ? claseDe(conInmobiliario, 'otros').dineroNuevoUsd : 0

  // Su casa natural es el Fondo Oportunidad, que no tiene minimo. Solo cambia
  // cuando el asesor fijo Mercados Privados y esa clase ya no puede crecer.
  const destino = destinoDeResiduos(conInmobiliario)
  const dondeCae =
    destino.clase === 'privados' ? FONDO_OPORTUNIDAD : NOMBRE_CLASE[destino.clase]

  if (residuoClub > EPS) {
    avisos.push(
      `Club Deals: el dinero nuevo (${residuoClub.toFixed(2)}) no llega al minimo de ` +
        `${reglas.club.minUsd.toLocaleString('en-US')} y pasa al ${dondeCae}.`,
    )
  }
  if (residuoOtros > EPS) {
    avisos.push(
      `Otros: el dinero nuevo (${residuoOtros.toFixed(2)}) no llega al minimo de ` +
        `${reglas.otros.minUsd.toLocaleString('en-US')} y pasa al ${dondeCae}.`,
    )
  }
  if ((residuoClub > EPS || residuoOtros > EPS) && destino.pisaUnAjuste) {
    avisos.push(
      'El residuo de Club Deals y Otros no cabía en ninguna clase libre y fue a ' +
        `${NOMBRE_CLASE[destino.clase]}, que estaba fijada: ese monto quedó por encima de lo ` +
        'que pediste.',
    )
  }

  const reparto = derivarResiduos(conInmobiliario, residuoClub, residuoOtros, destino.clase)

  const lineas = ORDEN_CLASES.flatMap((clase) =>
    lineasDeClase(clase, reparto, {
      pisos,
      pesos,
      perfil,
      ticketMinimoUsd,
      fallbacks,
      necesitaFlujos,
      institucional,
      reglas,
      club,
      otros,
      fijadas: new Set(reparto.porClase.filter((c) => c.fijada).map((c) => c.clase)),
    }),
  )

  const finales = ordenar(prorratearResiduales(lineas, ticketMinimoUsd))

  return {
    reparto: realinearConLasLineas(reparto, finales),
    lineas: finales,
    totalObjetivoUsd: finales.reduce((acc, l) => acc + l.usd, 0),
    dineroNuevoUsd: reparto.porClase.reduce((acc, c) => acc + c.dineroNuevoUsd, 0),
    avisos,
  }
}

/**
 * Devuelve el reparto a lo que dicen las lineas.
 *
 * El prorrateo de residuales barre entre clases: una linea de Fijo que no llega
 * al ticket desaparece y su monto engorda a las de Variable, que si lo superan.
 * Es lo que hace la macro y esta bien — lo que no puede quedar es el reparto
 * diciendo que Fijo tiene 228,123 cuando sus lineas suman 214,492.
 *
 * Esa diferencia no era cosmetica. La seccion 6 imprimia una clase cuyo total
 * no era la suma de sus filas, y el blotter calculaba las compras de cada clase
 * sobre las lineas que le quedaban: la clase que se quedo sin ninguna aportaba
 * cero, las compras no cuadraban contra las ventas y la propuesta se marcaba
 * como no publicable.
 *
 * El total no se mueve — el barrido conserva el dinero — solo la reparticion.
 */
function realinearConLasLineas(
  reparto: ResultadoReparto,
  lineas: readonly LineaPlan[],
): ResultadoReparto {
  const porClase: RepartoClase[] = reparto.porClase.map((clase) => {
    const suma = lineas.reduce((acc, l) => (l.clase === clase.clase ? acc + l.usd : acc), 0)
    if (Math.abs(suma - clase.objetivoUsd) <= TOL) return clase

    return {
      ...clase,
      objetivoUsd: suma,
      dineroNuevoUsd: Math.max(0, suma - clase.pisoUsd),
      cerrada: suma <= clase.pisoUsd + TOL,
    }
  })

  return { ...reparto, porClase }
}

/** Dolares redondos para un aviso: los centavos no ayudan a decidir. */
const redondo = (monto: number): string =>
  monto.toLocaleString('en-US', { maximumFractionDigits: 0 })

/**
 * Los ajustes que el piso no dejo cumplir.
 *
 * Fijar una clase por debajo de lo que el cliente ya tiene ahi pediria vender,
 * y vender se marca en la ficha, no en el panel de ajustes. El motor clava en
 * el piso y lo escribe: un ajuste aplicado a medias en silencio es una cifra
 * que despues nadie puede explicar.
 */
function avisosDeAjustes(ajustes: readonly AjusteAplicado[]): string[] {
  return ajustes
    .filter((ajuste) => ajuste.aplicadoUsd > ajuste.pedidoUsd + TOL)
    .map((ajuste) => {
      const pedido =
        ajuste.modo === 'excluir'
          ? 'pediste sacarla del cálculo'
          : `pediste fijarla en ${redondo(ajuste.pedidoUsd)}`
      return (
        `${NOMBRE_CLASE[ajuste.clase]}: ${pedido}, pero el cliente conserva ` +
        `${redondo(ajuste.pisoUsd)} ahí. Quedó en ${redondo(ajuste.aplicadoUsd)}; para bajarla, ` +
        'marcá la venta en la ficha.'
      )
    })
}

/**
 * Adonde va el dinero de Club y Otros que no llego a su minimo.
 *
 * Su casa natural es Mercados Privados, que tiene el Fondo Oportunidad y por
 * eso no tiene minimo. Pero una clase fijada por el asesor no puede recibir
 * dinero extra sin dejar de estar fijada, asi que el residuo busca la primera
 * clase libre. Si no hay ninguna vuelve a Privados y el llamador lo avisa: es
 * preferible un ajuste desbordado y dicho que un portafolio que no cuadra.
 */
function destinoDeResiduos(reparto: ResultadoReparto): {
  readonly clase: ClaseModelo
  readonly pisaUnAjuste: boolean
} {
  const fijada = (clase: ClaseModelo) =>
    reparto.porClase.find((c) => c.clase === clase)?.fijada ?? false

  const libre = CANDIDATAS_RESIDUO.find((clase) => !fijada(clase))
  return libre === undefined
    ? { clase: 'privados', pisaUnAjuste: true }
    : { clase: libre, pisaUnAjuste: false }
}

/**
 * Mueve el dinero nuevo de Club y Otros que no abrio hacia su clase destino.
 *
 * Ajusta el reparto — no solo las lineas — para que el objetivo de cada clase
 * siga siendo la suma de sus lineas. El total no cambia: es el mismo dinero
 * contado en otra clase.
 */
function derivarResiduos(
  reparto: ResultadoReparto,
  residuoClub: number,
  residuoOtros: number,
  destino: ClaseModelo,
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
    if (c.clase === destino) {
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
  /** La macro con la que se esta calculando. */
  readonly reglas: ReglasMotor
  /** Resultado de `repartirClub`, ya evaluado para derivar residuos. */
  readonly club: ReturnType<typeof repartirClub>
  /** Resultado de `repartirOtros`, ya evaluado para derivar residuos. */
  readonly otros: ReturnType<typeof repartirOtros>
  /**
   * Clases que el asesor clavo.
   *
   * Sus lineas quedan fuera del barrido de residuales en las dos direcciones:
   * una clase fijada que cede o recibe deja de estar fijada, y el monto que el
   * asesor escribio dejaria de ser el que sale impreso.
   */
  readonly fijadas: ReadonlySet<ClaseModelo>
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
      minSubfondoUsd: ctx.reglas.privados.minSubfondoUsd,
      minDividendosGlobalUsd: ctx.reglas.privados.minDividendosGlobalUsd,
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
    const exenta = ctx.fijadas.has(clase)
    // Los dos motores reciben el mismo ticket y el mismo fallback, pero cada
    // uno mira sus propios ajustes: la cascada, los de la poda; el de nucleo y
    // satelites, los del rescate.
    const nuevas = (clase === 'fijo'
      ? repartirEtfs(ctx.pesos.fijo, dineroNuevoUsd, {
          ticketMinimo: ctx.ticketMinimoUsd,
          fallback: ctx.fallbacks.fijo,
          ajustes: ctx.reglas.fijo,
        })
      : repartirVariable(ctx.pesos.variable, dineroNuevoUsd, {
          ticketMinimo: ctx.ticketMinimoUsd,
          fallback: ctx.fallbacks.variable,
          ajustes: ctx.reglas.variable,
        })
    ).map(
      (a): LineaPlan => ({
        instrumento: a.nombre,
        clase,
        usd: a.usd,
        ...(exenta ? { residuales: 'exenta' as const } : {}),
      }),
    )
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
