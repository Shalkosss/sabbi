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
