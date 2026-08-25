/**
 * Reparto de ETFs dentro de una clase de Mercados Publicos.
 *
 * Port de `ProcesarSeccionPublica` de la macro v4. Vale igual para Fijo y para
 * Variable: en la v4 los dos bloques pasan por esta misma rutina, sin nucleo ni
 * satelites ni cadenas de separacion. Es una sola regla, dicha en dos lineas:
 *
 *  1. Si la clase entera no llega al ticket minimo, no se abre ninguna linea:
 *     todo el monto se junta en un instrumento de consolidacion — los "Flip" —
 *     que existe justamente para eso.
 *  2. Si llega, se saca el ETF mas chico que quede por debajo del ticket y su
 *     monto se reparte a prorrata entre los que sobreviven. Se repite hasta
 *     que el mas chico de los vivos pase el ticket.
 *
 * El paso 2 termina siempre: cada vuelta mata a uno y el reparto solo puede
 * subir a los demas, asi que ninguno vuelve a caer por debajo del ticket una
 * vez que lo paso.
 *
 * El reparto se aplica sobre el dinero NUEVO de la clase, no sobre su objetivo
 * total: lo que el cliente ya conserva no se vuelve a comprar.
 */

const EPS = 1e-6
const TOL = 0.01

export interface AsignacionEtf {
  readonly nombre: string
  readonly usd: number
}

export interface OpcionesCascada {
  /** Ticket minimo por instrumento. */
  readonly ticketMinimo: number
  /**
   * Instrumento al que cae todo el monto cuando la clase no alcanza para un
   * ticket. En la configuracion son los "Flip".
   */
  readonly fallback: string
}

/**
 * Reparte `montoUsd` entre los instrumentos de `pesos`.
 *
 * Devuelve solo los que reciben dinero, ordenados de mayor a menor. El orden
 * es de presentacion: en la propuesta se leen uno al lado del otro.
 */
export function repartirEtfs(
  pesos: Readonly<Record<string, number>>,
  montoUsd: number,
  opciones: OpcionesCascada,
): AsignacionEtf[] {
  const { ticketMinimo, fallback } = opciones
  if (ticketMinimo <= 0) throw new Error('El ticket minimo debe ser mayor que cero.')
  if (montoUsd <= EPS) return []

  const nombres = Object.keys(pesos).filter((n) => (pesos[n] ?? 0) > 0)
  if (nombres.length === 0) return [{ nombre: fallback, usd: montoUsd }]

  // CASO A: la seccion completa no llega al ticket. Mejor una posicion viable
  // que cinco inviables.
  if (montoUsd < ticketMinimo - TOL) return [{ nombre: fallback, usd: montoUsd }]

  const sumaPesos = nombres.reduce((acc, n) => acc + (pesos[n] ?? 0), 0)
  const valores = nombres.map((n) => (montoUsd * (pesos[n] ?? 0)) / sumaPesos)
  const vivo = nombres.map(() => true)

  // CASO B: matar iterativamente al mas chico que no llegue, repartiendo su
  // monto a prorrata entre los que quedan.
  for (;;) {
    let peor = -1
    for (let i = 0; i < valores.length; i += 1) {
      if (!vivo[i]) continue
      if (peor === -1 || (valores[i] ?? 0) < (valores[peor] ?? 0)) peor = i
    }
    if (peor === -1) break
    if ((valores[peor] ?? 0) >= ticketMinimo - TOL) break

    const reparte = valores[peor] ?? 0
    let base = 0
    for (let i = 0; i < valores.length; i += 1) {
      if (vivo[i] && i !== peor) base += valores[i] ?? 0
    }
    // Queda uno solo y no llega: no hay a quien repartirle. Se deja como esta
    // — el caso A ya garantizo que la clase entera supera el ticket, asi que
    // este monto es ejecutable aunque sea el unico.
    if (base <= EPS) break

    for (let i = 0; i < valores.length; i += 1) {
      if (vivo[i] && i !== peor) {
        valores[i] = (valores[i] ?? 0) + reparte * ((valores[i] ?? 0) / base)
      }
    }
    vivo[peor] = false
    valores[peor] = 0
  }

  return nombres
    .map((nombre, i) => ({ nombre, usd: vivo[i] ? (valores[i] ?? 0) : 0 }))
    .filter((a) => a.usd > EPS)
    .sort((a, b) => b.usd - a.usd)
}
