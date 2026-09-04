import type { ClaseAllocation } from '@sabbi/core'

/**
 * El color de cada clase de la torta.
 *
 * Dos familias antes que ocho colores: las públicas en gris-verde apagado, las
 * alternativas en la rampa de marca. La pregunta que la torta contesta no es
 * «cuánto Real Estate hay» sino «cuánto se movió a alternativos», y eso se lee
 * por familia. Adentro de cada una el tono separa y no jerarquiza.
 *
 * Los valores viven en `globals.css` y acá solo su nombre: el juego oscuro
 * necesita otros tonos y `light-dark()` los resuelve sin que el componente
 * sepa en qué tema está. Mismo criterio que `perfiles.ts`.
 *
 * La clave es el nombre de la clase tal como está en `allocation_clases`. Una
 * clase que la mesa agregue y no esté acá sale en el color neutro en vez de
 * romper: la torta se dibuja igual y se ve que falta elegirle tono.
 */

const VARIABLE: Readonly<Record<string, string>> = {
  'Renta Variable Pública': '--alloc-rv',
  'Renta Fija Pública': '--alloc-rf',
  'Private Credit': '--alloc-pc',
  'Private Equity': '--alloc-pe',
  'Venture Capital': '--alloc-vc',
  Infrastructure: '--alloc-infra',
  'Real Estate': '--alloc-re',
  'Hedge Funds': '--alloc-hf',
}

export const colorClase = (clase: ClaseAllocation): string =>
  `var(${VARIABLE[clase] ?? '--alloc-otra'})`
