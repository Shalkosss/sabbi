/**
 * Poda pro rata: el motor de mercados publicos de la v4.
 *
 * Port de `ProcesarSeccionPublica` de la macro Benchmark Sabbi v4, que reparte
 * igual Renta Fija y Renta Variable. Es el mas simple de los tres motores del
 * repositorio y hace exactamente dos cosas:
 *
 *  1. Si la seccion entera no llega al ticket, no imprime instrumentos: todo
 *     el monto se junta en el instrumento de consolidacion. Mejor una posicion
 *     ejecutable que cinco que no lo son.
 *  2. Si llega, saca el instrumento mas chico que quede por debajo del ticket,
 *     reparte su monto pro rata entre los que siguen vivos, y vuelve a mirar.
 *     Termina cuando el mas chico llega al ticket.
 *
 * Lo que NO hace, y por eso es distinto de `cascada.ts`: no rescata al que se
 * queda cerca del minimo, no impone pisos escalonados entre los
 * sobrevivientes y no limita cuanto puede perder cada uno. Los tres campos de
 * `ReglasCascada` quedan sin mirar cuando el motor es este; siguen guardados
 * porque vuelven a valer en cuanto alguien elija la cascada.
 *
 * Un detalle del bucle que en la hoja se ve y aca no: cuando la reparticion
 * deja un solo instrumento vivo por debajo del ticket, no hay entre quienes
 * repartirlo y el bucle corta. La linea sale igual, con su monto entero. Es lo
 * que hace la macro (`If baseSum <= 0 Then Exit Do`) y es lo correcto: el
 * monto ya paso el ticket de la seccion, y consolidarlo contra el instrumento
 * de fallback perderia el unico nombre que quedaba.
 */

import type { AsignacionEtf } from './cascada.js'

const EPS = 1e-6
const TOL = 0.01

export interface OpcionesPoda {
  /** Ticket minimo por instrumento. */
  readonly ticketMinimo: number
  /**
   * Instrumento al que cae todo el monto cuando la seccion no llega ni a un
   * ticket. En la configuracion son los "Flip".
   */
  readonly fallback: string
}

/**
 * Reparte `montoUsd` entre los instrumentos de `pesos`, podando los chicos.
 *
 * Devuelve solo los que reciben dinero, ordenados de mayor a menor, con la
 * misma forma que `repartirEtfs` para que el ensamblador del plan pueda
 * elegir motor sin saber cual es cual.
 */
export function repartirPoda(
  pesos: Readonly<Record<string, number>>,
  montoUsd: number,
  opciones: OpcionesPoda,
): AsignacionEtf[] {
  const { ticketMinimo, fallback } = opciones
  if (ticketMinimo <= 0) throw new Error('El ticket minimo debe ser mayor que cero.')
  if (montoUsd <= EPS) return []

  const nombres = Object.keys(pesos).filter((n) => (pesos[n] ?? 0) > 0)
  if (nombres.length === 0) return [{ nombre: fallback, usd: montoUsd }]

  // La seccion entera no da para un ticket: se consolida, igual que en la
  // cascada. Es el `CASO A` de la macro.
  if (montoUsd < ticketMinimo - TOL) return [{ nombre: fallback, usd: montoUsd }]

  const sumaPesos = nombres.reduce((acc, n) => acc + (pesos[n] ?? 0), 0)
  const valores = nombres.map((n) => (montoUsd * (pesos[n] ?? 0)) / sumaPesos)
  const vivo = nombres.map(() => true)

  // Cada vuelta mata como mucho a uno, asi que no puede haber mas vueltas que
  // instrumentos. El tope es una red, no parte del algoritmo.
  for (let vuelta = 0; vuelta < nombres.length; vuelta += 1) {
    let masChico = -1
    for (let i = 0; i < valores.length; i += 1) {
      if (!vivo[i]) continue
      if (masChico < 0 || (valores[i] ?? 0) < (valores[masChico] ?? 0)) masChico = i
    }
    if (masChico < 0) break
    if ((valores[masChico] ?? 0) >= ticketMinimo - TOL) break

    const aRepartir = valores[masChico] ?? 0
    const base = valores.reduce(
      (acc, v, i) => (vivo[i] && i !== masChico ? acc + v : acc),
      0,
    )
    // Nadie con quien repartir: el ultimo que queda se queda con todo aunque
    // no llegue al ticket.
    if (base <= EPS) break

    for (let i = 0; i < valores.length; i += 1) {
      if (!vivo[i] || i === masChico) continue
      valores[i] = (valores[i] ?? 0) + aRepartir * ((valores[i] ?? 0) / base)
    }
    vivo[masChico] = false
    valores[masChico] = 0
  }

  return nombres
    .map((nombre, i) => ({ nombre, usd: vivo[i] ? (valores[i] ?? 0) : 0 }))
    .filter((a) => a.usd > EPS)
    .sort((a, b) => b.usd - a.usd)
}
