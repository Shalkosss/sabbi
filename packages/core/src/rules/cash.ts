/**
 * El recorte de liquidez del perfil conservador.
 *
 * Port del `PASO PREVIO 0` de la macro Benchmark Sabbi v4. Es lo primero que
 * toca el motor, antes del solver de pisos, del umbral inmobiliario y de la
 * clase Otros: el resto del calculo trabaja ya sobre el benchmark corregido.
 *
 * El argumento de la mesa es que el benchmark conservador carga mas liquidez
 * de la que necesita un cliente que ya vino a invertir. El recorte no la
 * elimina —el conservador sigue siendo el perfil con mas cash— sino que le
 * saca unos puntos y los devuelve a las clases que si buscan retorno.
 *
 * Dos precisiones que en la hoja se prestaban a confusion:
 *
 *  - Son PUNTOS PORCENTUALES del portafolio, no una fraccion del cash. Cinco
 *    puntos llevan un 16.47% a un 11.47%, no a un 15.65%.
 *  - Los puntos se calculan sobre la suma real del benchmark y no sobre uno,
 *    para que el recorte siga siendo exacto aunque la columna del perfil no
 *    sume 100.000000% clavado.
 *
 * La suma total no cambia: lo que sale de cash entra en las demas, cada una
 * segun su propio peso. Un benchmark donde ninguna otra clase pesa no tiene a
 * donde mandar la liquidez liberada, y entonces el recorte no se aplica.
 */

import type { Benchmark, ClaseModelo, Perfil } from '../domain/tipos.js'
import { CLASES } from '../domain/tipos.js'

const EPS = 1e-6

/** El unico perfil al que se le recorta el cash. Los demas ya traen el suyo. */
export const PERFIL_DEL_RECORTE: Perfil = 'Conservador'

/**
 * Devuelve el benchmark con el cash recortado, si corresponde.
 *
 * Se puede llamar siempre: con puntos en cero, con otro perfil o sin cash en
 * el benchmark devuelve el mismo objeto y el llamador no tiene que preguntar.
 *
 * @param benchmark  pesos por clase, no necesariamente normalizados
 * @param perfil     perfil de la propuesta
 * @param puntos     fraccion del portafolio que se le saca a cash
 */
export function recortarCash(
  benchmark: Benchmark,
  perfil: Perfil,
  puntos: number,
): Benchmark {
  if (perfil !== PERFIL_DEL_RECORTE) return benchmark
  if (!Number.isFinite(puntos) || puntos <= 0) return benchmark

  const cash = benchmark.cash
  if (cash <= EPS) return benchmark

  const total = CLASES.reduce((acc, clase) => acc + benchmark[clase], 0)
  if (total <= EPS) return benchmark

  // Nunca se puede sacar mas cash del que hay: un recorte de treinta puntos
  // sobre un perfil que tiene diez no deja el cash en negativo, lo deja en
  // cero. Que el numero no tenga sentido lo dice el rango del campo, no una
  // excepcion en mitad del calculo.
  const libera = Math.min(total * puntos, cash)

  const receptoras = CLASES.filter((clase) => clase !== 'cash')
  const base = receptoras.reduce((acc, clase) => acc + benchmark[clase], 0)
  if (base <= EPS) return benchmark

  const recortado = { ...benchmark, cash: cash - libera } as Record<ClaseModelo, number>
  for (const clase of receptoras) {
    recortado[clase] = benchmark[clase] + libera * (benchmark[clase] / base)
  }

  return recortado
}
