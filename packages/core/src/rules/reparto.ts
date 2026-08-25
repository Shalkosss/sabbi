import type {
  AjusteAplicado,
  AjusteClase,
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
 * Un ajuste es la tercera fuente y la unica que puede empujar hacia abajo:
 * clava el objetivo de una clase en un monto — o en cero — antes de la primera
 * vuelta. Esa clase nace cerrada, su monto sale del repartible y el resto se
 * prorratea entre las demas por el mismo camino que ya existia. Lo que un
 * ajuste no puede es bajar de lo que el cliente conserva: para eso hay que
 * vender, y vender se marca en la ficha.
 *
 * Cash va blindado: conserva su peso de benchmark y no entra en la base del
 * prorrateo, asi que una posicion conservada en otra clase no le puede quitar
 * liquidez al cliente. Es la regla de la macro v4 y la unica excepcion al
 * reparto proporcional. Si el propio Cash trae un piso mayor que su peso, ese
 * exceso si sale a repartirse entre las demas.
 *
 * @param benchmark  pesos por clase; se normalizan, no hace falta que sumen 1
 * @param patrimonioTotalUsd  suma de las posiciones invertibles
 * @param pisos  minimos por clase, de cualquier origen
 * @param ajustes  montos clavados por el asesor, por clase
 * @param blindadas  clases que conservan su peso y no ceden al prorrateo
 */
/**
 * Las clases que el motor blinda cuando el llamador no dice otra cosa.
 *
 * Se exporta porque no es un detalle del solver: quien quiera anticipar lo que
 * el solver va a hacer —el gate de `armarEntradaPlan`, sin ir mas lejos— tiene
 * que saber que Cash no es destino del prorrateo. Dos ideas distintas de que
 * clases pueden recibir es exactamente como un caso imposible pasa el gate y
 * revienta despues.
 */
export const CLASES_BLINDADAS: ReadonlySet<ClaseModelo> = new Set(['cash'])

export function repartirPorClase(
  benchmark: Benchmark,
  patrimonioTotalUsd: number,
  pisos: readonly Piso[],
  ajustes: readonly AjusteClase[] = [],
  blindadas: ReadonlySet<ClaseModelo> = CLASES_BLINDADAS,
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

  const aplicados = aplicarAjustes(ajustes, pisoPorClase)
  const fijadas = new Map(aplicados.map((a) => [a.clase, a.aplicadoUsd]))
  const sumaFijados = suma(fijadas.values())
  if (sumaFijados > patrimonioTotalUsd + TOL) {
    throw new Error(
      `Los montos fijados suman ${sumaFijados.toFixed(2)} y superan el patrimonio de ` +
        `${patrimonioTotalUsd.toFixed(2)}. Baja alguno o sacale el ajuste.`,
    )
  }

  // Una clase con peso cero pero con piso sigue existiendo: conserva su piso y
  // nunca recibe dinero nuevo. Una clase fijada nace cerrada por decision del
  // asesor, tenga el peso que tenga.
  const abiertas = new Set<ClaseModelo>(
    CLASES.filter((c) => (benchmark[c] ?? 0) > 0 && !fijadas.has(c)),
  )
  const cerradas = new Map<ClaseModelo, number>(fijadas)

  // Una clase blindada se cierra en su peso antes de la primera vuelta: recibe
  // lo que le toca del benchmark y despues no participa. Un ajuste del asesor
  // le gana — si clavo Cash en un monto, manda ese monto.
  const escala = CLASES.reduce((acc, c) => acc + (benchmark[c] ?? 0), 0)
  for (const clase of blindadas) {
    if (fijadas.has(clase) || !abiertas.has(clase)) continue
    const porBenchmark = escala > 0 ? (patrimonioTotalUsd * benchmark[clase]) / escala : 0
    cerradas.set(clase, Math.max(porBenchmark, pisoPorClase.get(clase) ?? 0))
    abiertas.delete(clase)
  }

  for (const clase of CLASES) {
    if (abiertas.has(clase) || cerradas.has(clase)) continue
    const piso = pisoPorClase.get(clase) ?? 0
    if (piso > 0) cerradas.set(clase, piso)
  }

  let repartible = patrimonioTotalUsd - suma(cerradas.values())
  let objetivos = new Map<ClaseModelo, number>()
  let base = 0
  let iteraciones = 0

  while (iteraciones < MAX_ITERACIONES) {
    iteraciones += 1

    const sumaPesos = [...abiertas].reduce((acc, c) => acc + benchmark[c], 0)
    if (abiertas.size === 0 || sumaPesos <= 0) {
      if (repartible > TOL) {
        throw new Error(
          `Quedan ${repartible.toFixed(2)} sin ninguna clase abierta donde ponerlos. ` +
            'Sacale el ajuste a alguna clase para que el resto se pueda prorratear.',
        )
      }
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
      // Una clase blindada esta cerrada en el solver, pero no lo esta en el
      // sentido que la propuesta usa la palabra: recibe dinero nuevo y abre
      // sus lineas. `cerrada` marca solo a las que quedaron en su piso.
      cerrada: cerrada && objetivo <= piso + TOL,
      fijada: fijadas.has(clase),
    }
  })

  return { porClase, baseRedistribucion: base, iteraciones, ajustes: aplicados }
}

/**
 * Resuelve cada ajuste contra el piso de su clase.
 *
 * Dos ajustes sobre la misma clase serian dos verdades a la vez; manda el
 * ultimo, que es el que el asesor acaba de escribir. Lo que ningun ajuste puede
 * es pedir menos que el piso: el resultado queda clavado ahi y el llamador
 * compara `pedidoUsd` contra `aplicadoUsd` para decirlo en pantalla.
 */
function aplicarAjustes(
  ajustes: readonly AjusteClase[],
  pisoPorClase: ReadonlyMap<ClaseModelo, number>,
): AjusteAplicado[] {
  const ultimo = new Map<ClaseModelo, AjusteClase>()
  for (const ajuste of ajustes) ultimo.set(ajuste.clase, ajuste)

  return CLASES.flatMap((clase): AjusteAplicado[] => {
    const ajuste = ultimo.get(clase)
    if (ajuste === undefined) return []

    const piso = pisoPorClase.get(clase) ?? 0
    const pedido = ajuste.modo === 'excluir' ? 0 : Math.max(0, ajuste.montoUsd)

    return [
      {
        clase,
        modo: ajuste.modo,
        pedidoUsd: pedido,
        aplicadoUsd: Math.max(pedido, piso),
        pisoUsd: piso,
      },
    ]
  })
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
