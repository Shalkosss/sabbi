import type { ClaseModelo, Restriccion } from '@sabbi/core'

/**
 * Instrumentos de consolidación.
 *
 * Cuando una clase no alcanza para abrir ninguna línea ejecutable, el motor
 * junta todo su dinero en un instrumento único. Los nombres son los del
 * catálogo, tal cual: el motor imprime lo que la propuesta muestra y lo que la
 * tabla `products` conoce, así que no hay nada que traducir después.
 */
export const FALLBACKS = {
  fijo: 'Flip - Panda Zen',
  variable: 'Flip - Cobra achorada',
} as const

/**
 * Un producto del menu ofrecible, para el desplegable de "agregar activo".
 *
 * Vive de este lado — no en `lib/datos`, que es `server-only` — porque el tipo
 * lo consume un componente de cliente y arrastrar el modulo de datos hasta el
 * navegador enveneraria el bundle.
 */
export interface ProductoOfrecible {
  /** El id de `products`. Es lo que enlaza la linea con su retorno. */
  readonly id: string
  readonly nombre: string
  readonly clase: ClaseModelo | null
}

/**
 * Un activo que el asesor agrega al portafolio objetivo.
 *
 * Es una restriccion del motor —clava un monto en una clase— mas lo que el
 * catalogo necesita para que la linea no salga muda: sin rentabilidad y sin
 * distribucion, la seccion 6 de la propuesta imprime la fila con dos celdas
 * vacias, y una celda vacia en una tabla de retornos se lee como un cero.
 *
 * Esos dos datos no viven en la restriccion sino en `products`: guardar un
 * activo agregado da de alta el producto y la restriccion lo referencia, que
 * es el mismo camino por el que un producto elegido del menu trae su retorno.
 * Asi el activo que alguien cargo una vez queda para la proxima propuesta.
 */
export interface ActivoAgregado extends Restriccion {
  /** Rentabilidad anual esperada, como fraccion. Un rango, no un numero. */
  readonly retMin: number | null
  readonly retMax: number | null
  /** La parte de esa rentabilidad que se reparte en efectivo. */
  readonly distMin: number | null
  readonly distMax: number | null
  /** «Trimestral», «Mensual»… Vacio cuando el producto no distribuye. */
  readonly distFrecuencia: string | null
}
