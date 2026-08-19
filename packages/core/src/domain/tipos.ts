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
}

export interface ResultadoReparto {
  readonly porClase: readonly RepartoClase[]
  /**
   * Monto repartible dividido por la suma de pesos de las clases abiertas.
   * Es la celda E69 del Excel de propuesta y el mejor invariante para detectar
   * una regresion en el reparto.
   */
  readonly baseRedistribucion: number
  readonly iteraciones: number
}
