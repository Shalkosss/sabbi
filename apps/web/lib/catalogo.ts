/**
 * Instrumentos de consolidación.
 *
 * Cuando una clase no alcanza para abrir ninguna línea ejecutable, el motor
 * junta todo su dinero en un instrumento único. Los nombres viven acá, y no
 * repartidos por el código, hasta que la app lea la tabla `products` de
 * Supabase: ese es el paso que los convierte en catálogo de verdad.
 */
export const FALLBACKS = {
  fijo: 'Flip Panda',
  variable: 'Flip Cobra',
} as const
