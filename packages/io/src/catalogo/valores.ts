/**
 * Lectura de los numeros sueltos del catalogo.
 *
 * La misma columna trae «3.50% - 4.14%», «0.5%», «0.05», «0» y «PENDIENTE».
 * Los tres primeros son la misma cifra escrita de tres maneras y el ultimo no
 * es una cifra: es un pendiente que alguien tiene que llenar, y guardarlo como
 * cero seria afirmar que ese producto no rinde nada.
 */

import { normalizar } from '../texto.js'
import type { Celda } from '../xlsx/leer.js'

const NUMERO = /-?\d+(?:[.,]\d+)?(?:[eE][+-]?\d+)?/g

export interface Rango {
  readonly min: number
  readonly max: number
}

const texto = (celda: Celda): string =>
  celda === null || celda === undefined ? '' : String(celda).trim()

/**
 * Los numeros de una celda, ya en fraccion.
 *
 * Si el texto trae `%`, los numeros son puntos porcentuales y se dividen. Si
 * no, ya vienen como fraccion: Excel guarda una celda con formato de
 * porcentaje como 0.035, y asi la devuelve el lector.
 */
function fracciones(celda: Celda): readonly number[] {
  const crudo = texto(celda)
  if (crudo === '') return []

  const enPuntos = crudo.includes('%')
  const encontrados = [...crudo.matchAll(NUMERO)]
    .map((m) => Number.parseFloat(m[0].replace(',', '.')))
    .filter((n) => Number.isFinite(n))

  return enPuntos ? encontrados.map((n) => n / 100) : encontrados
}

/** Un rango. Un valor unico se lee como un rango de ancho cero. */
export function leerRango(celda: Celda): Rango | null {
  const valores = fracciones(celda)
  if (valores.length === 0) return null

  const min = Math.min(...valores)
  const max = Math.max(...valores)
  return { min, max }
}

/**
 * Un valor unico. Cuando la celda trae varios — «Clase A 1.75% - Clase B
 * 1.05%» son dos productos escritos en una fila — se toma el menor y el
 * llamador decide si eso merece un aviso.
 */
export function leerValor(celda: Celda): number | null {
  const valores = fracciones(celda)
  return valores.length === 0 ? null : Math.min(...valores)
}

/** `true` si la celda trae mas de una cifra y por lo tanto hay que revisarla. */
export const esAmbiguo = (celda: Celda): boolean => fracciones(celda).length > 1

/** Sí, No, x, vacio. Todo lo que no sea afirmativo es `false`. */
export function leerBandera(celda: Celda): boolean {
  const crudo = normalizar(texto(celda))
  return crudo === 'si' || crudo === 'x' || crudo === 'true' || crudo === '1'
}

export const leerTexto = (celda: Celda): string | null => {
  const crudo = texto(celda)
  return crudo === '' ? null : crudo
}
