/**
 * Normalizacion de los valores de la ficha.
 *
 * Cada celda de una ficha llega en el formato que el cliente tuvo a mano: el
 * rendimiento como `0.049` o como `"6.5%"`, la moneda como `"Dólares"` o como
 * `"USD"`, la pertenencia como `1`, `0.5` o `"50%"`. Aca se convierte todo a la
 * forma que usa el motor, y cada conversion dudosa devuelve su aviso en vez de
 * elegir en silencio.
 */

import type { Celda } from '../xlsx/leer.js'
import { normalizar } from '../texto.js'

export type Moneda = 'PEN' | 'USD'

export interface Leido<T> {
  readonly valor: T
  /** Presente solo cuando la conversion tuvo que suponer algo. */
  readonly aviso?: string
}

/** Numero de una celda: acepta el numero crudo o el monto escrito a mano. */
export function leerNumero(celda: Celda): number | null {
  if (typeof celda === 'number') return Number.isFinite(celda) ? celda : null
  if (typeof celda !== 'string') return null

  // "$ 120,000.50" → "120000.50". El separador de miles peruano es la coma.
  const limpio = celda.replace(/[^\d,.-]/g, '').replace(/,(?=\d{3}\b)/g, '')
  if (limpio === '' || limpio === '-') return null
  const numero = Number.parseFloat(limpio.replace(',', '.'))
  return Number.isFinite(numero) ? numero : null
}

/**
 * Rendimiento anual a decimal.
 *
 * Un numero mayor que 1 casi siempre es un porcentaje sin dividir: la ficha de
 * referencia trae `6.5%` como texto en una fila y `0.049` como numero en otra.
 * Se corrige, pero queda el aviso para que el asesor lo confirme.
 */
export function leerRendimiento(celda: Celda): Leido<number | null> {
  if (typeof celda === 'string' && celda.includes('%')) {
    const numero = leerNumero(celda)
    return numero === null ? { valor: null } : { valor: numero / 100 }
  }

  const numero = leerNumero(celda)
  if (numero === null) return { valor: null }
  if (numero > 1) {
    return {
      valor: numero / 100,
      aviso: `Rendimiento ${numero} interpretado como porcentaje: ${numero / 100}. Confírmalo.`,
    }
  }
  return { valor: numero }
}

/** Moneda del desplegable. Sin dato asume dolares, que es la columna de valor. */
export function leerMoneda(celda: Celda): Leido<Moneda> {
  if (typeof celda !== 'string' || celda.trim() === '') return { valor: 'USD' }

  const texto = normalizar(celda)
  if (texto.startsWith('sol') || texto === 'pen' || texto.startsWith('s/')) return { valor: 'PEN' }
  if (texto.startsWith('dolar') || texto === 'usd' || texto.startsWith('$')) return { valor: 'USD' }
  return { valor: 'USD', aviso: `Moneda "${celda}" no reconocida, se asumió dólares.` }
}

/** Porcentaje de pertenencia como fraccion. Sin dato asume la propiedad entera. */
export function leerPorcentaje(celda: Celda): number {
  const numero = leerNumero(celda)
  if (numero === null) return 1
  return numero > 1 ? numero / 100 : numero
}

/** Cap rate de un inmueble en renta: alquiler anualizado sobre su valor. */
export function capRate(alquilerMensual: number | null, valorUsd: number): number | null {
  if (alquilerMensual === null || alquilerMensual <= 0 || valorUsd <= 0) return null
  return (alquilerMensual * 12) / valorUsd
}
