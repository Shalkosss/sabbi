import type { ClaseModelo } from '@sabbi/core'

/**
 * Nombres de las siete clases del motor, para toda la interfaz.
 *
 * La tabla vive en el motor y se reexporta desde acá: los avisos del motor
 * también nombran clases, y dos diccionarios en paralelo fue como Club Deals
 * se llamó de dos maneras distintas en la misma página.
 */
export { NOMBRE_CLASE } from '@sabbi/core'

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
