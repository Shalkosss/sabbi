import type { Perfil } from '@sabbi/core'

/**
 * El color de cada perfil, en una sola rampa.
 *
 * Los cinco perfiles son ordinales —de menos a más riesgo— y el color tiene
 * que decir eso solo. Antes eran cinco verdes de la marca y las tres curvas se
 * confundían entre sí: en un gráfico de líneas superpuestas, cinco tonos del
 * mismo matiz obligan a mirar la leyenda para cada una.
 *
 * La rampa va de azul a rojo pasando por verde y naranja, que es como se lee
 * el riesgo sin explicación previa. El azul y el rojo anclan los extremos; el
 * verde de la marca se queda con el Moderado, que es el centro; los dos
 * perfiles intermedios ocupan las transiciones.
 *
 * Los valores viven en `globals.css` como tokens y acá solo su nombre: el
 * juego oscuro necesita otros tonos, y `light-dark()` los resuelve sin que
 * ningún componente tenga que saber en qué tema está.
 */

const VARIABLE: Readonly<Record<Perfil, string>> = {
  Conservador: '--perfil-conservador',
  'Conservador & Moderado': '--perfil-conservador-moderado',
  Moderado: '--perfil-moderado',
  'Moderado & Arriesgado': '--perfil-moderado-arriesgado',
  Arriesgado: '--perfil-arriesgado',
}

/** El color de la línea y del punto. Medido para leerse sobre el fondo. */
export const colorPerfil = (perfil: Perfil): string =>
  `var(${VARIABLE[perfil] ?? '--perfil-moderado'})`

/** La banda del encabezado de su tarjeta. Siempre lleva texto claro encima. */
export const bandaPerfil = (perfil: Perfil): string =>
  `var(${VARIABLE[perfil] ?? '--perfil-moderado'}-banda)`

/** Nombre corto, para donde el largo no entra. */
export const PERFIL_CORTO: Readonly<Record<Perfil, string>> = {
  Conservador: 'Conservador',
  'Conservador & Moderado': 'Cons. & Mod.',
  Moderado: 'Moderado',
  'Moderado & Arriesgado': 'Mod. & Arr.',
  Arriesgado: 'Arriesgado',
}
