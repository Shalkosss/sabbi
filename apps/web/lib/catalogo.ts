import type { ClaseModelo } from '@sabbi/core'

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
  readonly nombre: string
  readonly clase: ClaseModelo | null
}
