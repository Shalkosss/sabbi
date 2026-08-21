/**
 * Reparto de ETFs dentro de una clase.
 *
 * Port de `CascadaProRata` y `ProcesarSeccionOptima` de la macro Benchmark
 * Sabbi v8. Reemplaza la cascada simple de las versiones anteriores, que sacaba
 * el ETF mas chico y repartia su monto a prorrata entre los demas.
 *
 * v8 hace dos cosas distintas:
 *
 *  1. Poda por costo. Solo descarta lo que quedaria por debajo de una fraccion
 *     del ticket minimo — la mitad, en la v8. Un ETF que llega al 60% del
 *     minimo no se tira: se rescata.
 *  2. Cadena de separacion. A los sobrevivientes les impone pisos escalonados
 *     (minimo, minimo x1.15, x1.15^2 ... en la v8) para que no queden todos
 *     pegados al minimo, y comprueba que ninguno sacrifique mas de una parte de
 *     su objetivo — el 20%, en la v8. Si la combinacion no es viable, descarta
 *     el mas chico y reintenta.
 *
 * Las tres tolerancias salen de la macro; los numeros de arriba son los que
 * trae la v8 y los que fija el golden test.
 *
 * El reparto se aplica sobre el dinero NUEVO de la clase, no sobre su objetivo
 * total: lo que el cliente ya conserva no se vuelve a comprar.
 *
 * En v8 esta rutina quedo solo para Fijo. Variable tiene motor propio — ver
 * `variable.ts` — con nucleo, satelites y rescate de rango.
 */

import { REGLAS_V8 } from '../domain/reglas.js'
import type { ReglasCascada } from '../domain/reglas.js'

const EPS = 1e-6
const TOL = 0.01
const MAX_VUELTAS = 100
const MAX_CICLOS = 50

export interface AsignacionEtf {
  readonly nombre: string
  readonly usd: number
}

export interface OpcionesCascada {
  /** Ticket minimo por instrumento. */
  readonly ticketMinimo: number
  /**
   * Instrumento al que cae todo el monto cuando ni siquiera alcanza para un
   * ticket. En la configuracion son los "Flip".
   */
  readonly fallback: string
  /**
   * Las tres tolerancias de la cascada, que salen de la macro.
   *
   * Sin ellas manda la v8, que es lo que fija el golden test.
   */
  readonly ajustes?: ReglasCascada
}

/**
 * Reparte `montoUsd` entre los instrumentos de `pesos`.
 *
 * Devuelve solo los que reciben dinero, ordenados de mayor a menor. El orden
 * es de presentacion: la macro dejaba variable ordenado y fijo no, y en la
 * propuesta se leen uno al lado del otro.
 */
export function repartirEtfs(
  pesos: Readonly<Record<string, number>>,
  montoUsd: number,
  opciones: OpcionesCascada,
): AsignacionEtf[] {
  const { ticketMinimo, fallback, ajustes = REGLAS_V8.fijo } = opciones
  if (ticketMinimo <= 0) throw new Error('El ticket minimo debe ser mayor que cero.')
  if (montoUsd <= EPS) return []

  const nombres = Object.keys(pesos).filter((n) => (pesos[n] ?? 0) > 0)
  if (nombres.length === 0) return [{ nombre: fallback, usd: montoUsd }]

  // No alcanza para un solo ticket: todo al fallback. Mejor una posicion viable
  // que cinco inviables.
  if (montoUsd < ticketMinimo - TOL) return [{ nombre: fallback, usd: montoUsd }]

  const sumaPesos = nombres.reduce((acc, n) => acc + (pesos[n] ?? 0), 0)
  const objetivo = nombres.map((n) => (montoUsd * (pesos[n] ?? 0)) / sumaPesos)
  const cuota = objetivo.map((v) => v / montoUsd)

  const valores = resolver(objetivo, cuota, montoUsd, ticketMinimo, ajustes)

  return nombres
    .map((nombre, i) => ({ nombre, usd: valores[i] ?? 0 }))
    .filter((a) => a.usd > EPS)
    .sort((a, b) => b.usd - a.usd)
}

function resolver(
  objetivo: readonly number[],
  cuota: readonly number[],
  total: number,
  minimo: number,
  ajustes: ReglasCascada,
): number[] {
  const n = objetivo.length
  const vivo = new Array<boolean>(n).fill(true)
  let valores = new Array<number>(n).fill(0)

  podar(vivo, cuota, total, minimo, ajustes.factorDescarte)

  for (let ciclo = 0; ciclo < MAX_CICLOS; ciclo += 1) {
    const orden = indicesVivos(vivo).sort((a, b) => (objetivo[a] ?? 0) - (objetivo[b] ?? 0))
    if (orden.length === 0) break

    // Cadena de separacion: el mas chico al minimo, cada siguiente un tanto
    // por ciento mas — 15 en la v8, lo que diga la macro despues.
    const piso = new Array<number>(n).fill(0)
    orden.forEach((idx, k) => {
      piso[idx] = k === 0 ? minimo : (piso[orden[k - 1]!] ?? 0) * (1 + ajustes.separacion)
    })

    const intento = repartirConPisos(
      vivo,
      cuota,
      piso,
      objetivo,
      total,
      minimo,
      ajustes.maxSacrificio,
    )
    if (intento) {
      valores = intento
      break
    }

    const vivos = indicesVivos(vivo)
    if (vivos.length <= 1) break
    const masChico = vivos.reduce((a, b) => ((objetivo[a] ?? 0) <= (objetivo[b] ?? 0) ? a : b))
    vivo[masChico] = false
  }

  // El residuo de redondeo va a la posicion mas grande, para cerrar exacto.
  const vivos = indicesVivos(vivo)
  for (let i = 0; i < n; i += 1) if (!vivo[i]) valores[i] = 0
  if (vivos.length > 0) {
    const mayor = vivos.reduce((a, b) => ((valores[a] ?? 0) >= (valores[b] ?? 0) ? a : b))
    const asignado = vivos.reduce((acc, i) => acc + (valores[i] ?? 0), 0)
    valores[mayor] = (valores[mayor] ?? 0) + (total - asignado)
  }
  return valores
}

/** Descarta lo que no llega ni a la mitad del ticket minimo. */
function podar(
  vivo: boolean[],
  cuota: readonly number[],
  total: number,
  minimo: number,
  factorDescarte: number,
): void {
  for (let vuelta = 0; vuelta < MAX_VUELTAS; vuelta += 1) {
    const vivos = indicesVivos(vivo)
    const sumaCuota = vivos.reduce((acc, i) => acc + (cuota[i] ?? 0), 0)
    if (vivos.length <= 1 || sumaCuota <= EPS) return

    const escala = (i: number) => (total * (cuota[i] ?? 0)) / sumaCuota

    let peor = -1
    let menor = Number.POSITIVE_INFINITY
    for (const i of vivos) {
      const v = escala(i)
      if (v < factorDescarte * minimo - EPS && v < menor) {
        menor = v
        peor = i
      }
    }

    if (peor < 0) {
      // Nadie es tan chico como para descartarlo, pero tampoco entran todos.
      if (vivos.length * minimo <= total + TOL) return
      for (const i of vivos) {
        const v = escala(i)
        if (v < menor) {
          menor = v
          peor = i
        }
      }
    }

    if (peor < 0) return
    vivo[peor] = false
  }
}

/**
 * Reparte respetando la cadena de pisos.
 *
 * Devuelve null si la combinacion no es viable: alguien queda bajo el minimo o
 * sacrifica mas del 20% de su objetivo. El llamador descarta uno y reintenta.
 */
function repartirConPisos(
  vivo: readonly boolean[],
  cuota: readonly number[],
  piso: readonly number[],
  objetivo: readonly number[],
  total: number,
  minimo: number,
  maxSacrificio: number,
): number[] | null {
  const n = cuota.length
  const clavado = new Array<boolean>(n).fill(false)

  for (let vuelta = 0; vuelta < MAX_VUELTAS; vuelta += 1) {
    const libres = indicesVivos(vivo).filter((i) => !clavado[i])
    const resto =
      total - indicesVivos(vivo).reduce((acc, i) => acc + (clavado[i] ? (piso[i] ?? 0) : 0), 0)
    if (libres.length === 0) break
    const sumaCuota = libres.reduce((acc, i) => acc + (cuota[i] ?? 0), 0)
    if (sumaCuota <= EPS || resto <= EPS) return null

    let peor = -1
    let mayorBrecha = TOL
    for (const i of libres) {
      const brecha = (piso[i] ?? 0) - (resto * (cuota[i] ?? 0)) / sumaCuota
      if (brecha > mayorBrecha) {
        mayorBrecha = brecha
        peor = i
      }
    }
    if (peor < 0) break
    clavado[peor] = true
  }

  const valores = new Array<number>(n).fill(0)
  const vivos = indicesVivos(vivo)
  const libres = vivos.filter((i) => !clavado[i])
  const resto = total - vivos.reduce((acc, i) => acc + (clavado[i] ? (piso[i] ?? 0) : 0), 0)
  const sumaCuota = libres.reduce((acc, i) => acc + (cuota[i] ?? 0), 0)

  if (libres.length > 0 && sumaCuota > EPS) {
    for (const i of vivos) valores[i] = clavado[i] ? (piso[i] ?? 0) : 0
    for (const i of libres) {
      const v = (resto * (cuota[i] ?? 0)) / sumaCuota
      if (v < minimo - TOL) return null
      if (v < (1 - maxSacrificio) * (objetivo[i] ?? 0) - TOL) return null
      valores[i] = v
    }
    return valores
  }

  // Todos clavados: se escala la cadena de pisos para que cierre en el total.
  const sumaPisos = vivos.reduce((acc, i) => acc + (piso[i] ?? 0), 0)
  if (sumaPisos <= EPS || sumaPisos > total + TOL) return null
  const factor = total / sumaPisos
  for (const i of vivos) valores[i] = (piso[i] ?? 0) * factor
  return valores
}

function indicesVivos(vivo: readonly boolean[]): number[] {
  const out: number[] = []
  for (let i = 0; i < vivo.length; i += 1) if (vivo[i]) out.push(i)
  return out
}
