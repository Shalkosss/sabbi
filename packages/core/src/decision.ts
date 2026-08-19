/**
 * La decisión con la que arranca cada posición.
 *
 * El objetivo del flujo es que subir la ficha deje una propuesta completa: el
 * asesor corrige excepciones, no llena dieciséis casillas para ver la primera
 * cifra. Esta función es la que produce esa primera decisión, y es una
 * propuesta del sistema, no una orden — todas quedan editables en la revisión.
 *
 * Tres reglas, en orden:
 *
 *  1. Un inmueble no se liquida para rebalancear. Se conserva, y el de uso
 *     propio queda fuera del cálculo por su cuenta.
 *  2. Lo que el cliente ya tiene y Sabbi ofrece, se conserva. Es el neteo: si
 *     ya está en el portafolio objetivo, venderlo y recomprarlo es pagar dos
 *     veces por quedarse donde está.
 *  3. Todo lo demás se vende. Ese es el dinero que el modelo reparte, y es lo
 *     que hace que la vista comparativa tenga algo que comparar.
 *
 * `sin_marcar` deja de ser el estado inicial de todo. Sigue existiendo para lo
 * que el sistema no puede decidir — una posición sin clase resuelta —, que es
 * justo donde el asesor tiene que mirar.
 */

import type { Cta } from './domain/tipos.js'

export interface PosicionDecidible {
  readonly origen: 'financiero' | 'inmueble'
  /** Referencia al catálogo. `null` cuando la posición no se reconoció. */
  readonly productoId: string | null
  readonly claseModelo: string | null
}

/**
 * Decisión inicial de una posición.
 *
 * @param ofrecibles  ids de los productos que Sabbi propone como destino: el
 *                    menú real de cada clase, no el catálogo completo.
 *                    Confundirlos produjo el bug v37.25.
 */
export function decisionInicial(
  posicion: PosicionDecidible,
  ofrecibles: ReadonlySet<string>,
): Cta {
  // Un inmueble de uso propio no participa de ningún cálculo; marcarlo de una
  // manera u otra no cambia nada, y «conservar» es lo que describe la realidad.
  if (posicion.origen === 'inmueble') return 'conservar'

  // Sin clase resuelta el motor no puede colocar el dinero en ningún lado.
  // Queda sin marcar a propósito: es la fila que el asesor tiene que atender.
  if (posicion.claseModelo === null) return 'sin_marcar'

  if (posicion.productoId !== null && ofrecibles.has(posicion.productoId)) {
    return 'conservar'
  }

  return 'venta_total'
}
