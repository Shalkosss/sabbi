/**
 * Recorte de liquidez del perfil Conservador.
 *
 * Port del PASO PREVIO 0 de `AjustarPorPosicionesFijas` de la macro v4.
 *
 * El benchmark del Conservador deja 16.4730% del portafolio en Cash, que es
 * mas liquidez de la que ese perfil necesita parada. La mesa le recorta cinco
 * puntos porcentuales —no un 5% relativo: el peso pasa a 11.4730%— y esos
 * puntos se reparten pro-rata entre las otras cinco clases, cada una segun su
 * propio peso. La suma no cambia.
 *
 * Se aplica antes que nada. El resto del motor —la clase Otros, el umbral del
 * inmobiliario, las posiciones conservadas— trabaja ya sobre el benchmark
 * corregido, que es el orden de la macro y el unico que produce sus cifras.
 *
 * Los puntos se calculan sobre la suma real del benchmark y no sobre 1, para
 * que el recorte siga siendo exacto aunque la columna del perfil no sume
 * 100.000000% clavado — que es lo que pasa con los pesos a precision completa
 * de la hoja.
 */

import type { Benchmark, ClaseModelo, Perfil } from '../domain/tipos.js'
import { CLASES } from '../domain/tipos.js'

const EPS = 1e-9

/** El unico perfil al que se le recorta la liquidez. */
export const PERFIL_DEL_RECORTE: Perfil = 'Conservador'

/** Las clases que reciben los puntos que suelta Cash: todas menos Cash. */
const RECEPTORAS: readonly ClaseModelo[] = CLASES.filter((clase) => clase !== 'cash')

/**
 * Devuelve el benchmark con la liquidez del Conservador ya recortada.
 *
 * Fuera de ese perfil, o con el recorte en cero, devuelve el benchmark intacto
 * — el llamador puede invocarla siempre sin preguntar.
 *
 * @param puntos fraccion del portafolio que se le quita a Cash; 0.05 son cinco
 *               puntos porcentuales
 */
export function recortarCash(
  benchmark: Benchmark,
  perfil: Perfil,
  puntos: number,
): Benchmark {
  if (perfil !== PERFIL_DEL_RECORTE || puntos <= 0) return benchmark
  if (benchmark.cash <= EPS) return benchmark

  const total = CLASES.reduce((acc, clase) => acc + benchmark[clase], 0)
  // Nunca se puede sacar mas Cash del que hay.
  const libera = Math.min(total * puntos, benchmark.cash)

  const base = RECEPTORAS.reduce((acc, clase) => acc + benchmark[clase], 0)
  // Si ninguna otra clase tiene peso no hay a donde mandar la liquidez y el
  // recorte no se aplica: seria dinero sin destino.
  if (base <= EPS) return benchmark

  return Object.fromEntries(
    CLASES.map((clase) => [
      clase,
      clase === 'cash'
        ? benchmark.cash - libera
        : benchmark[clase] + libera * (benchmark[clase] / base),
    ]),
  ) as Benchmark
}
