import type { ClaseModelo } from '@sabbi/core'

/**
 * Nombres de las siete clases del motor, para toda la interfaz.
 *
 * Una sola tabla: tres componentes con su propio diccionario fue como Club
 * Deals se llamó de dos maneras distintas en la misma página.
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

/** Para celdas angostas: chips, selects y columnas de tabla. */
export const NOMBRE_CLASE_CORTO: Readonly<Record<ClaseModelo, string>> = {
  inm: 'Inmobiliario',
  fijo: 'Renta Fija',
  variable: 'Renta Variable',
  privados: 'Privados',
  club: 'Club Deals',
  otros: 'Otros',
  cash: 'Cash',
}

/** El orden de bloques de la hoja Allocation detallado, que usa el motor. */
export const ORDEN_CLASES: readonly ClaseModelo[] = [
  'inm',
  'fijo',
  'variable',
  'privados',
  'club',
  'otros',
  'cash',
]
