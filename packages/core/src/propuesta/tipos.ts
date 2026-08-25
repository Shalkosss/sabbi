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
  /** Plazo minimo de permanencia: «Flexible», «3 años». Del catalogo. */
  readonly liquidez: string | null
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
  /**
   * El mismo motor corrido sin los ajustes del asesor.
   *
   * Es el portafolio que el sistema propone solo, a partir de la ficha y del
   * benchmark del perfil. Al lado del ajustado contesta la unica pregunta que
   * un ajuste deja abierta: que cambio por lo que yo toque.
   *
   * `null` cuando no hay ajustes — los dos portafolios serian el mismo — y la
   * vista de los dos portafolios no se arma.
   */
  readonly planSistema?: Plan | null
  readonly pisos: readonly Piso[]
  readonly benchmark: Benchmark
  readonly parametros: ParametrosPropuesta
  /**
   * El mismo toggle que recibio el motor.
   *
   * Apagado, los inmuebles de renta salen del patrimonio financiero y el plan
   * no los reparte. La foto de hoy y los cuadres tienen que mirar ese mismo
   * universo: comparar un "antes" que los incluye contra un "despues" que no
   * hace que el patrimonio se encoja en pantalla sin que nadie venda nada.
   */
  readonly incluirInmueblesDeRenta?: boolean
  /** Catalogo por nombre de instrumento. Lo que no esta, no se afirma. */
  readonly catalogo?: ReadonlyMap<string, DatosProducto>
  /** Asset classes del catalogo, para poder mostrar tambien las que van en cero. */
  readonly assetClassCatalogo?: readonly string[]
  /**
   * Lo que el asesor escribio de cada linea, por nombre de instrumento.
   *
   * El motor no lo produce ni lo valida: lo transporta desde la pantalla hasta
   * el deck, que es el unico lugar donde se lee.
   */
  readonly anotaciones?: ReadonlyMap<string, AnotacionLinea>
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
  | 'venta_condicionada'
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
  /** Plazo minimo del catalogo. Vacio cuando el producto no lo declara. */
  readonly liquidez: string | null
  /**
   * Lo que el asesor escribe sobre esta linea.
   *
   * Que es el instrumento y para que esta en el portafolio. No sale de ningun
   * dato: son las dos columnas que el deck de referencia lleva escritas a mano
   * y que solo el asesor puede llenar. Vacias mientras nadie las escriba.
   */
  readonly descripcion: string
  readonly proposito: string
}

/** Lo que el asesor escribio sobre una linea del objetivo. */
export interface AnotacionLinea {
  readonly descripcion: string
  readonly proposito: string
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
  /**
   * El ticket minimo con el que se corrio.
   *
   * Es el unico numero de la macro que el asesor mueve propuesta por
   * propuesta, asi que explica por si solo por que una linea salio y otra no.
   * Va con los parametros visibles y no solo en la macro: quien lee el Excel
   * un mes despues no tiene la pantalla al lado.
   */
  readonly ticketMinimoUsd: number
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

import type {
  ClaseAntesDespues,
  VistaComparativa,
  VistaDosPortafolios,
  VistaHoy,
} from './vistas.js'

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
  /**
   * Los dos portafolios objetivo lado a lado, contra la foto de hoy.
   *
   * `null` cuando el asesor no ajusto nada: sin ajustes no hay dos portafolios
   * que comparar, hay uno.
   */
  readonly dosPortafolios: VistaDosPortafolios | null
  /**
   * El antes y el despues de cada clase, posicion por posicion.
   *
   * Es la vista que el deck pone lado a lado: a la izquierda lo que el cliente
   * tiene con su nombre, a la derecha lo que el plan propone.
   */
  readonly antesYDespues: readonly ClaseAntesDespues[]
  /** Avisos del motor mas los que nacen de armar la propuesta. */
  readonly avisos: readonly string[]
}
