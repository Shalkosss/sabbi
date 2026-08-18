/**
 * Prorrateo de residuales.
 *
 * Port de `ProrratearResiduales` de la macro Benchmark Sabbi v8. Es la ultima
 * pasada del motor: despues de repartir cada clase en instrumentos, cualquier
 * linea que quedo por debajo del ticket minimo se elimina y su monto se reparte
 * entre las que si lo superan, en proporcion a lo que ya tienen.
 *
 * El racional es el mismo de la cascada: una posicion de 3,000 dolares no se
 * puede ejecutar y ensucia la propuesta. Mejor tres lineas viables que cinco
 * con dos muertas.
 *
 * Quien participa y quien no — es la parte que v8 reescribio:
 *
 *  - El cash quedo aislado en las dos direcciones. No se lo absorbe aunque no
 *    llegue al ticket y tampoco engorda con los restos de los fondos. En v6
 *    participaba y por eso los residuos terminaban en la caja.
 *  - Los productos privados no ceden nunca, porque sus minimos son propios y ya
 *    los resolvio `repartirPrivados`. Reciben solo si no quedo ninguna otra
 *    linea capaz de hacerlo: en la macro es el segundo intento del paso 2.
 *  - Lo clavado por restriccion no participa: el asesor puso ese monto a mano.
 *
 * Una diferencia deliberada con la macro: si no queda nadie que pueda recibir,
 * la macro borraba igual las residuales y ese dinero desaparecia del plan. Aca
 * no se poda nada en ese caso, porque el cuadre contra el disponible es un
 * invariante del producto.
 */

import type { LineaPlan } from '../domain/tipos.js'

const EPS = 1e-6

/**
 * Elimina las lineas bajo el ticket minimo y reparte su monto entre el resto.
 *
 * @param ticketMinimoUsd  monto minimo ejecutable de una posicion
 */
export function prorratearResiduales(
  lineas: readonly LineaPlan[],
  ticketMinimoUsd: number,
): LineaPlan[] {
  if (ticketMinimoUsd <= 0) {
    throw new Error(`El ticket minimo debe ser mayor que cero, se recibio ${ticketMinimoUsd}.`)
  }

  const plena = (l: LineaPlan): boolean => l.residuales === undefined && l.usd > EPS
  const esResidual = (l: LineaPlan): boolean => plena(l) && l.usd < ticketMinimoUsd - EPS

  const residuo = lineas.filter(esResidual).reduce((acc, l) => acc + l.usd, 0)
  if (residuo <= EPS) return [...lineas]

  const puedeRecibir = (l: LineaPlan, conReserva: boolean): boolean =>
    (plena(l) || (conReserva && l.residuales === 'reserva')) &&
    l.usd >= ticketMinimoUsd - EPS &&
    !esResidual(l)

  // Primer intento sin privados; si nadie puede recibir, se los admite.
  const conReserva = lineas.filter((l) => puedeRecibir(l, false)).length === 0
  const base = lineas
    .filter((l) => puedeRecibir(l, conReserva))
    .reduce((acc, l) => acc + l.usd, 0)
  if (base <= EPS) return [...lineas]

  return lineas
    .filter((l) => !esResidual(l))
    .map((l) =>
      puedeRecibir(l, conReserva) ? { ...l, usd: l.usd + (residuo * l.usd) / base } : l,
    )
}
