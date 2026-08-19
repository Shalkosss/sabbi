/**
 * La propuesta, como objeto.
 *
 * Siete secciones que salen de tres cosas: las posiciones revisadas, los
 * parametros de la propuesta y el plan que devolvio el motor. Nada de esto se
 * recalcula despues: la vista web, el Excel y los dos decks leen este mismo
 * objeto, porque tres implementaciones de la misma suma son tres respuestas
 * distintas esperando a divergir.
 *
 * Todo lo que no se puede sostener con datos viaja como `null`. La herramienta
 * no afirma un retorno esperado que no esta en el catalogo.
 */

import type { Benchmark, ClaseModelo, Cta, Moneda, Perfil, Piso, Plaza } from '../domain/tipos.js'
import type { PosicionRevisada } from '../entrada.js'
import type { Plan } from '../plan.js'

/**
 * Una posicion con todo lo que la propuesta muestra.
 *
 * El motor recibe un subconjunto — `PosicionRevisada` — porque solo le importa
 * lo que cambia el calculo. La propuesta necesita el resto: la moneda, la
 * plaza, el pais del inmueble, el porcentaje que le pertenece al cliente.
 */
export interface PosicionPropuesta extends PosicionRevisada {
  readonly orden: number
  readonly tipoFicha: string | null
  readonly assetClass: string | null
  readonly moneda: Moneda
  readonly plaza: Plaza
  readonly rendimientoEst: number | null
  readonly nota: string
  readonly pais: string | null
  /** Fraccion del inmueble que es del cliente. 1 cuando es entero. */
  readonly pctPertenencia: number
  /** Valor completo del bien, antes de aplicar la pertenencia. */
  readonly valorDeclaradoUsd: number
  readonly uso: string | null
}

/** Lo que el catalogo sabe de un instrumento. Todo opcional: puede no estar. */
export interface DatosProducto {
  readonly retMin: number | null
  readonly retMax: number | null
  readonly distMin: number | null
  readonly distMax: number | null
  readonly distFrecuencia: string | null
  readonly moneda: string | null
}

export interface ParametrosPropuesta {
  readonly ticketMinimoUsd: number
  readonly colchonLiquidezUsd: number
  readonly fxPenUsd: number
}

export interface EntradaPropuesta {
  readonly cliente: {
    readonly nombre: string
    readonly perfil: Perfil
    readonly mandato: string | null
  }
  readonly posiciones: readonly PosicionPropuesta[]
  readonly plan: Plan
  /**
   * El mismo motor corrido sin pisos.
   *
   * Es el benchmark aplicado al patrimonio entero ignorando lo que el cliente
   * ya tiene. La seccion 6 lo pone al lado del recomendado: esa tabla es la
   * que explica por que el plan se desvia del modelo, y la que el asesor usa
   * para defender la propuesta.
   */
  readonly modeloPuro: Plan
  readonly pisos: readonly Piso[]
  readonly benchmark: Benchmark
  readonly parametros: ParametrosPropuesta
  /** Catalogo por nombre de instrumento. Lo que no esta, no se afirma. */
  readonly catalogo?: ReadonlyMap<string, DatosProducto>
  /** Asset classes del catalogo, para poder mostrar tambien las que van en cero. */
  readonly assetClassCatalogo?: readonly string[]
}

// --- Seccion 1: foto actual ---

export interface FilaActivo {
  readonly orden: number
  readonly institucionProducto: string
  readonly tipoFicha: string | null
  readonly assetClass: string | null
  readonly moneda: Moneda
  readonly plaza: Plaza
  readonly valorUsd: number
  readonly rendimientoEst: number | null
  readonly cta: Cta
  readonly nota: string
  readonly montoVentaParcialUsd: number
  /** Un inmueble en renta entra al patrimonio financiero como Inmobiliario Directo. */
  readonly esInmuebleDeRenta: boolean
}

// --- Seccion 2: uso propio ---

export interface FilaUsoPropio {
  readonly institucionProducto: string
  readonly pais: string | null
  readonly pctPertenencia: number
  readonly valorTotalUsd: number
  readonly valorTuyoUsd: number
  readonly uso: string | null
  readonly rendimientoEst: number | null
  readonly cta: Cta
  readonly nota: string
}

// --- Seccion 3: distribucion por asset class ---

export interface FilaAssetClass {
  readonly assetClass: string
  readonly valorUsd: number
  readonly share: number
  /** Lo que se queda, incluida la parte no vendida de una venta parcial. */
  readonly seConservaUsd: number
  readonly seVendeUsd: number
}

// --- Seccion 4: resumen de decisiones ---

export type CategoriaCta =
  | 'conservar'
  | 'venta_total'
  | 'parcial_vende'
  | 'parcial_conserva'
  | 'sin_marcar'

export interface FilaResumenCta {
  readonly categoria: CategoriaCta
  readonly etiqueta: string
  readonly valorUsd: number
  readonly share: number
}

// --- Seccion 5: exposicion ---

export interface FilaExposicion {
  readonly etiqueta: string
  readonly valorUsd: number
  readonly share: number
}

// --- Seccion 6: portafolio objetivo ---

export interface Rango {
  readonly min: number
  readonly max: number
}

export interface LineaObjetivo {
  readonly instrumento: string
  readonly usd: number
  readonly share: number
  /** Ya la tenia el cliente y se conserva, contra comprarla nueva. */
  readonly conservada: boolean
  readonly retornoTotal: Rango | null
  readonly retornoDistributivo: Rango | null
  readonly distribucionAnualUsd: Rango | null
  readonly moneda: string | null
  readonly nota: string | null
}

export interface GrupoObjetivo {
  readonly clase: ClaseModelo
  readonly objetivoUsd: number
  readonly share: number
  readonly cerrada: boolean
  readonly lineas: readonly LineaObjetivo[]
}

export interface FilaComparativo {
  readonly nivel: 'clase' | 'instrumento'
  readonly clase: ClaseModelo
  readonly etiqueta: string
  readonly modeloUsd: number
  readonly recomendadoUsd: number
  /** Diferencia en puntos porcentuales sobre el total objetivo. */
  readonly difPp: number
}

export interface ParametrosVisibles {
  readonly ticketFinancieroTotalUsd: number
  readonly montoAReinvertirUsd: number
  readonly fxPenUsd: number
  readonly colchonLiquidezUsd: number
  readonly pctModeloInmobiliario: number
  readonly baseRedistribucionUsd: number
}

// --- Seccion 7: blotter ---

export interface LineaVenta {
  readonly instrumento: string
  readonly accion: 'Venta total' | 'Venta parcial'
  readonly usd: number
}

export interface LineaCompra {
  readonly instrumento: string
  readonly clase: ClaseModelo
  readonly usd: number
}

// --- La propuesta entera ---

import type { VistaComparativa, VistaHoy } from './vistas.js'

export interface Propuesta {
  /** Vista 1: el portafolio de hoy, por clase y subclase, con su rentabilidad. */
  readonly vistaHoy: VistaHoy
  /** Vista 2: antes contra despues — la historia que ve el cliente. */
  readonly comparativa: VistaComparativa
  readonly cliente: EntradaPropuesta['cliente']
  readonly seccion1: {
    readonly filas: readonly FilaActivo[]
    readonly totalUsd: number
  }
  readonly seccion2: {
    readonly filas: readonly FilaUsoPropio[]
    readonly totalUsd: number
  }
  readonly seccion3: {
    readonly filas: readonly FilaAssetClass[]
    readonly totalUsd: number
  }
  readonly seccion4: {
    readonly filas: readonly FilaResumenCta[]
    readonly totalUsd: number
  }
  readonly seccion5: {
    readonly porMoneda: readonly FilaExposicion[]
    readonly porPlaza: readonly FilaExposicion[]
  }
  readonly seccion6: {
    readonly parametros: ParametrosVisibles
    readonly grupos: readonly GrupoObjetivo[]
    readonly comparativo: readonly FilaComparativo[]
    readonly totalUsd: number
    /** Objetivo menos patrimonio financiero. Tiene que dar cero. */
    readonly cuadreUsd: number
  }
  readonly seccion7: {
    readonly ventas: readonly LineaVenta[]
    readonly compras: readonly LineaCompra[]
    readonly totalVentasUsd: number
    readonly totalComprasUsd: number
    /** Compras menos ventas. Si no da cero, la propuesta no se publica. */
    readonly cuadreUsd: number
  }
  /** Avisos del motor mas los que nacen de armar la propuesta. */
  readonly avisos: readonly string[]
}
