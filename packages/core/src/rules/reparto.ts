import type {
  Benchmark,
  ClaseModelo,
  Piso,
  RepartoClase,
  ResultadoReparto,
} from '../domain/tipos.js'
import { CLASES } from '../domain/tipos.js'

/** Tolerancia para comparar un reparto tentativo contra un piso, en USD. */
const TOL = 0.01

/** Corta la iteracion si el punto fijo no converge. La macro usa el mismo tope. */
const MAX_ITERACIONES = 50

/**
 * Reparte el patrimonio entre clases respetando pisos.
 *
 * Es el equivalente de `RepartirObjetivo` de la macro Benchmark Sabbi, la unica
 * rutina que no cambio entre las versiones v6 y v8 del motor. Reproduce la
 * propuesta de Ana Tumi al centavo.
 *
 * El algoritmo busca un punto fijo. En cada vuelta reparte el monto que queda
 * entre las clases todavia abiertas, en proporcion a su peso de benchmark. Si a
 * alguna le tocaria menos que su piso, esa clase se cierra en el piso, su monto
 * sale del repartible y se vuelve a empezar sin ella. Termina cuando ninguna
 * clase abierta queda por debajo de su piso.
 *
 * Los pisos vienen de dos fuentes que el motor trata igual: posiciones que el
 * cliente conserva y restricciones que puso el asesor.
 *
 * @param benchmark  pesos por clase; se normalizan, no hace falta que sumen 1
 * @param patrimonioTotalUsd  suma de las posiciones invertibles
 * @param pisos  minimos por clase, de cualquier origen
 */
export function repartirPorClase(
  benchmark: Benchmark,
  patrimonioTotalUsd: number,
  pisos: readonly Piso[],
): ResultadoReparto {
  if (!Number.isFinite(patrimonioTotalUsd) || patrimonioTotalUsd <= 0) {
    throw new Error(
      `El patrimonio total debe ser un numero positivo, se recibio ${patrimonioTotalUsd}.`,
    )
  }

  const pisoPorClase = acumularPisos(pisos)
  const sumaPisos = CLASES.reduce((acc, c) => acc + (pisoPorClase.get(c) ?? 0), 0)
  if (sumaPisos > patrimonioTotalUsd + TOL) {
    throw new Error(
      `Los pisos suman ${sumaPisos.toFixed(2)} y superan el patrimonio de ` +
        `${patrimonioTotalUsd.toFixed(2)}. Revisa las posiciones conservadas y las restricciones.`,
    )
  }

  const abiertas = new Set<ClaseModelo>(CLASES.filter((c) => (benchmark[c] ?? 0) > 0))
  // Una clase con peso cero pero con piso sigue existiendo: conserva su piso y
  // nunca recibe dinero nuevo.
  const cerradas = new Map<ClaseModelo, number>()
  for (const clase of CLASES) {
    if (!abiertas.has(clase)) {
      const piso = pisoPorClase.get(clase) ?? 0
      if (piso > 0) cerradas.set(clase, piso)
    }
  }

  let repartible = patrimonioTotalUsd - suma(cerradas.values())
  let objetivos = new Map<ClaseModelo, number>()
  let base = 0
  let iteraciones = 0

  while (iteraciones < MAX_ITERACIONES) {
    iteraciones += 1

    const sumaPesos = [...abiertas].reduce((acc, c) => acc + benchmark[c], 0)
    if (abiertas.size === 0 || sumaPesos <= 0) {
      base = 0
      objetivos = new Map()
      break
    }

    base = repartible / sumaPesos
    objetivos = new Map([...abiertas].map((c) => [c, benchmark[c] * base]))

    const aCerrar = [...abiertas].filter(
      (c) => (pisoPorClase.get(c) ?? 0) >= (objetivos.get(c) ?? 0) - TOL,
    )
    if (aCerrar.length === 0) break

    for (const clase of aCerrar) {
      const piso = pisoPorClase.get(clase) ?? 0
      cerradas.set(clase, piso)
      repartible -= piso
      abiertas.delete(clase)
    }
  }

  const porClase: RepartoClase[] = CLASES.map((clase) => {
    const piso = pisoPorClase.get(clase) ?? 0
    const cerrada = cerradas.has(clase)
    const objetivo = cerrada ? (cerradas.get(clase) ?? 0) : (objetivos.get(clase) ?? 0)
    return {
      clase,
      objetivoUsd: objetivo,
      pisoUsd: piso,
      dineroNuevoUsd: Math.max(0, objetivo - piso),
      cerrada,
    }
  })

  return { porClase, baseRedistribucion: base, iteraciones }
}

function acumularPisos(pisos: readonly Piso[]): Map<ClaseModelo, number> {
  const acc = new Map<ClaseModelo, number>()
  for (const piso of pisos) {
    if (piso.montoUsd < 0) {
      throw new Error(`El piso "${piso.etiqueta}" tiene monto negativo (${piso.montoUsd}).`)
    }
    acc.set(piso.clase, (acc.get(piso.clase) ?? 0) + piso.montoUsd)
  }
  return acc
}

function suma(valores: Iterable<number>): number {
  let total = 0
  for (const v of valores) total += v
  return total
}
