/**
 * Tipos del dominio Sabbi.
 *
 * El vocabulario sale de la especificacion base y de la macro Benchmark Sabbi.
 * Nada de este archivo depende de Supabase, del DOM ni de la red.
 */

/** Los cinco perfiles de riesgo, ordinales de menor a mayor tolerancia. */
export const PERFILES = [
  'Conservador',
  'Conservador & Moderado',
  'Moderado',
  'Moderado & Arriesgado',
  'Arriesgado',
] as const
export type Perfil = (typeof PERFILES)[number]

/** Segmento por patrimonio. Cambia el juego de benchmarks oficiales. */
export const SEGMENTOS = ['lt500', 'gte500'] as const
export type Segmento = (typeof SEGMENTOS)[number]

/**
 * Las siete clases del motor.
 *
 * Distinta de `assetClass`, que es la taxonomia granular que ve el cliente en
 * la propuesta. Confundirlas produjo el bug v37.25b: el motor contaba el dinero
 * en una clase y la tabla lo mostraba en otra.
 *
 * Club Deals y Otros fueron familias internas de Mercados Privados hasta la
 * config v3. Son clases propias desde la v4: la hoja Allocation detallado las
 * trae como bloques de primer nivel, y como clases el solver de pisos las netea
 * contra lo conservado por si solo — el neteo por familia que el motor viejo
 * hacia a mano dentro de privados.
 */
export const CLASES = ['fijo', 'variable', 'privados', 'club', 'otros', 'inm', 'cash'] as const
export type ClaseModelo = (typeof CLASES)[number]

/**
 * Como se llama cada clase donde la lee una persona.
 *
 * Vive aca y no en la interfaz porque los avisos del motor tambien nombran
 * clases, y dos diccionarios en paralelo son como Club Deals termino
 * llamandose de dos maneras en la misma pantalla.
 */
export const NOMBRE_CLASE: Readonly<Record<ClaseModelo, string>> = {
  inm: 'Inmobiliario Directo',
  fijo: 'Mercados Públicos — Renta Fija',
  variable: 'Mercados Públicos — Renta Variable',
  privados: 'Mercados Privados',
  club: 'Club Deals',
  otros: 'Otros — Oro y BTC',
  cash: 'Cash',
}

/** Decision del asesor sobre una posicion. */
export const CTAS = ['conservar', 'venta_total', 'venta_parcial', 'sin_marcar'] as const
export type Cta = (typeof CTAS)[number]

export type Moneda = 'PEN' | 'USD'
export type Plaza = 'Perú' | 'Offshore'

/** Una posicion de la ficha patrimonial, ya normalizada. */
export interface Posicion {
  readonly id: string
  readonly institucionProducto: string
  /** Valor crudo del desplegable de la ficha. */
  readonly tipoFicha?: string
  /** Taxonomia granular Sabbi: "Money Market", "Club Deals Real Estate", ... */
  readonly assetClass: string
  readonly claseModelo: ClaseModelo
  /** Referencia al catalogo. Null cuando la posicion no se reconoce. */
  readonly productoId: string | null
  readonly moneda: Moneda
  readonly plaza: Plaza
  readonly valorUsd: number
  readonly rendimientoEst: number | null
  readonly feePct: number | null
  /**
   * Un inmueble de uso propio queda fuera de todo calculo. No es lo mismo que
   * valor cero: no entra al patrimonio ni al denominador de los pesos.
   */
  readonly esInvertible: boolean
  readonly cta: Cta
  readonly montoVentaParcial: number
  readonly nota?: string
}

/**
 * Restriccion del asesor: clava un monto en una clase o en un producto.
 *
 * Sin `productoId` es una tenencia libre — "Acciones MSFT 30k", "Bono Verition
 * 20k" — que el asesor asigna a una clase. Cubre clase pero no netea producto,
 * igual que una posicion conservada que no esta en el menu de su clase.
 */
export interface Restriccion {
  readonly id: string
  readonly nombre: string
  readonly montoUsd: number
  readonly clase: ClaseModelo
  readonly productoId: string | null
}

/**
 * Ajuste del asesor sobre una clase del portafolio objetivo.
 *
 * Un piso solo empuja hacia arriba: una clase nunca recibe menos de lo que el
 * cliente ya tiene ahi. Un ajuste manda en las dos direcciones. `fijar` clava
 * el objetivo de la clase en `montoUsd` aunque el benchmark le diera mas —
 * Inmobiliario Directo en 60,000 cuando el modelo le daba 70,000 — y `excluir`
 * la deja en cero. En los dos casos la clase sale del reparto y lo que sobra se
 * prorratea entre las demas en proporcion a su peso, que es exactamente lo que
 * el solver ya hace con el dinero de una clase cerrada.
 *
 * El unico limite es el piso: fijar por debajo de lo que el cliente conserva
 * pediria vender, y vender es una decision de la ficha, no de este panel. El
 * motor clava en el piso y lo dice.
 */
export interface AjusteClase {
  readonly clase: ClaseModelo
  readonly modo: 'fijar' | 'excluir'
  /** Monto objetivo de la clase. `excluir` lo ignora: siempre es cero. */
  readonly montoUsd: number
}

/** Un ajuste ya pasado por el solver, con lo que realmente pudo aplicar. */
export interface AjusteAplicado {
  readonly clase: ClaseModelo
  readonly modo: 'fijar' | 'excluir'
  readonly pedidoUsd: number
  readonly aplicadoUsd: number
  /** Lo conservado y lo restringido en esa clase: el limite de la bajada. */
  readonly pisoUsd: number
}

/**
 * Piso de una clase: el minimo que esa clase debe recibir.
 *
 * Es la abstraccion que unifica los tres mecanismos del motor. Una posicion
 * conservada, una restriccion sobre catalogo y una tenencia libre son todas
 * pisos; lo unico que cambia es de donde salen.
 */
export interface Piso {
  readonly clase: ClaseModelo
  readonly montoUsd: number
  readonly origen: 'conservado' | 'restriccion'
  readonly etiqueta: string
}

/**
 * Una linea del plan: un instrumento con su monto, dentro de una clase.
 *
 * Es la unidad que ve el cliente en la propuesta y la que se vuelca al Excel y
 * al PPT. El motor la produce; nadie la muta.
 */
export interface LineaPlan {
  readonly instrumento: string
  readonly clase: ClaseModelo
  readonly usd: number
  /**
   * Papel de la linea en el prorrateo de residuales.
   *
   * Sin valor participa entera: cede su monto si no llega al ticket y recibe el
   * de las demas si lo supera. `exenta` no hace ninguna de las dos — el cash,
   * el inmobiliario y todo lo clavado por restriccion. `reserva` no cede nunca
   * y solo recibe si no quedo ninguna linea plena que pueda hacerlo, que es lo
   * que v8 hace con los productos privados.
   */
  readonly residuales?: 'exenta' | 'reserva'
  readonly nota?: string
}

/** Pesos de benchmark por clase. Deben sumar 1. */
export type Benchmark = Readonly<Record<ClaseModelo, number>>

/** Resultado del reparto por clase. */
export interface RepartoClase {
  readonly clase: ClaseModelo
  /** Monto final asignado a la clase. */
  readonly objetivoUsd: number
  /** Piso acumulado que la clase traia. */
  readonly pisoUsd: number
  /** Dinero nuevo a comprar: objetivo menos piso, nunca negativo. */
  readonly dineroNuevoUsd: number
  /** Una clase se cierra cuando su piso supera lo que el benchmark le daria. */
  readonly cerrada: boolean
  /** La clase quedo en este monto porque el asesor lo pidio, no el benchmark. */
  readonly fijada: boolean
}

export interface ResultadoReparto {
  readonly porClase: readonly RepartoClase[]
  /** Los ajustes del asesor y lo que el piso dejo aplicar de cada uno. */
  readonly ajustes: readonly AjusteAplicado[]
  /**
   * Monto repartible dividido por la suma de pesos de las clases abiertas.
   * Es la celda E69 del Excel de propuesta y el mejor invariante para detectar
   * una regresion en el reparto.
   */
  readonly baseRedistribucion: number
  readonly iteraciones: number
}
