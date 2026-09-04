import type { Mes, ObservacionMensual } from '../retornos/tipos.js'

/**
 * Tipos de la pantalla de Allocation.
 *
 * Tercer dominio del paquete, aparte del motor y aparte de los retornos de
 * fondos. Contesta una sola pregunta: qué le pasa a un portafolio clásico
 * cuando se le mete un porcentaje de alternativos.
 *
 * No comparte tipos con `domain/tipos.ts` — no reparte patrimonio de nadie ni
 * entra al solver — y de `retornos/` toma prestado exactamente uno,
 * `ObservacionMensual`, porque las series con las que mide son las mismas que
 * ya carga la mesa. Misma regla de la casa: función pura, sin red, sin DOM,
 * sin reloj.
 *
 * Ningún número de negocio vive acá. Los pesos del 60/40, los de la mezcla y
 * qué índice mide cada clase entran como argumento; salen de la base, que es
 * donde la mesa los edita.
 */

/**
 * Una clase de la torta.
 *
 * Es un `string` y no una unión cerrada a propósito: las clases se listan en
 * `allocation_clases` y la mesa puede agregar una sin que haya que desplegar.
 * Un tipo cerrado acá obligaría a que cada alta pase por el repositorio, que
 * es justo lo que esta pantalla evita.
 */
export type ClaseAllocation = string

/** Un reparto: clase y fracción. Las fracciones suman uno. */
export type Reparto = ReadonlyMap<ClaseAllocation, number>

/** La serie de cada clase, por el nombre de la clase. */
export type SeriesPorClase = ReadonlyMap<ClaseAllocation, readonly ObservacionMensual[]>

/**
 * Un portafolio ya armado y listo para medir.
 *
 * `faltan` son las clases que tienen peso y no tienen serie cargada. Mientras
 * haya una sola, el portafolio no publica métricas: medirlo salteándola diría
 * que el 40% de renta fija rindió lo mismo que el resto, que es inventar el
 * dato que falta. Regla 7 del proyecto.
 */
export interface Portafolio {
  readonly nombre: string
  readonly reparto: Reparto
  readonly faltan: readonly ClaseAllocation[]
}

/** Lo que la tabla comparativa publica de un portafolio. */
export interface Metricas {
  /** Primer y último mes efectivamente medidos. `null` si no se pudo medir. */
  readonly desde: Mes | null
  readonly hasta: Mes | null
  readonly meses: number
  /** Retorno compuesto de toda la ventana. */
  readonly acumulado: number | null
  /** El mismo retorno como tasa anual. */
  readonly anualizado: number | null
  /** Desviación estándar mensual anualizada. */
  readonly volatilidad: number | null
  /** La peor caída contra el máximo previo, como fracción negativa. */
  readonly maximaCaida: number | null
  /** Los meses entre los que ocurrió esa caída, para poder nombrarla. */
  readonly caidaDesde: Mes | null
  readonly caidaHasta: Mes | null
}

/** Una ventana histórica con nombre: la crisis, el rebote, la pandemia. */
export interface Escenario {
  readonly nombre: string
  readonly desde: Mes
  readonly hasta: Mes
}

/** Lo que rindió un portafolio dentro de una de esas ventanas. */
export interface ResultadoEscenario {
  readonly escenario: Escenario
  /** Retorno compuesto de la ventana. `null` si la serie no la cubre entera. */
  readonly retorno: number | null
  /** `true` cuando la serie arranca después de que el escenario empezó. */
  readonly fueraDeSerie: boolean
}
