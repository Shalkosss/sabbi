import { ventanaDe } from './metricas.js'
import type { MetricasFondo } from './tipos.js'

/**
 * Los comparativos de la mesa: quien rinde, quien tiembla y quien paga el riesgo.
 *
 * La hoja `Ranking Fondos` hacia esto con una columna por ventana y un
 * `LARGE()` por fila, y por eso estaba llena de `#NUM!`: cuando un fondo no
 * llega a la ventana, la formula no lo saltea, lo rompe. Aca un fondo sin dato
 * simplemente no entra al ranking, y la vista dice cuantos quedaron afuera.
 *
 * Todo es funcion pura sobre las metricas ya calculadas. No vuelve a tocar las
 * series: si un ranking y la tabla maestra mostraran numeros distintos, seria
 * porque alguien calculo dos veces.
 */

/** Que se ordena. Cada criterio sabe de donde sale su numero y hacia donde es «mejor». */
export type Criterio = 'retorno' | 'desviacion' | 'sharpe'

/** Un fondo en un ranking, ya con su puesto. */
export interface Puesto {
  readonly puesto: number
  readonly fondoId: string
  readonly nombre: string
  readonly assetClass: string
  readonly valor: number
}

/** Un ranking armado: los que entraron, y cuantos no. */
export interface Ranking {
  readonly criterio: Criterio
  readonly ventana: string
  readonly puestos: readonly Puesto[]
  /** Fondos sin dato para esta ventana. Se informa, no se esconde. */
  readonly sinDato: number
}

const valorDe = (metricas: MetricasFondo, ventana: string, criterio: Criterio): number | null => {
  const v = ventanaDe(metricas, ventana)
  if (v === null) return null
  return criterio === 'retorno' ? v.retorno : criterio === 'desviacion' ? v.desviacion : v.sharpe
}

/**
 * Ordena los fondos por un criterio en una ventana.
 *
 * `descendente` por defecto, que es lo que quiere decir «mejor» para retorno y
 * Sharpe. Para desviacion el mejor es el mas bajo, pero el ranking que la mesa
 * pide es «quien tiene mayor desviacion», asi que el sentido se elige afuera y
 * no lo adivina el criterio.
 */
export function rankear(
  fondos: readonly MetricasFondo[],
  ventana: string,
  criterio: Criterio,
  descendente = true,
): Ranking {
  const conDato = fondos
    .map((m) => ({ metricas: m, valor: valorDe(m, ventana, criterio) }))
    .filter((f): f is { metricas: MetricasFondo; valor: number } => f.valor !== null)

  const ordenados = [...conDato].sort((a, b) =>
    descendente ? b.valor - a.valor : a.valor - b.valor,
  )

  return {
    criterio,
    ventana,
    puestos: ordenados.map((f, i) => ({
      puesto: i + 1,
      fondoId: f.metricas.fondo.id,
      nombre: f.metricas.fondo.nombre,
      assetClass: f.metricas.fondo.assetClass,
      valor: f.valor,
    })),
    sinDato: fondos.length - conDato.length,
  }
}

/** Los extremos de una clase de activo en una ventana. */
export interface ExtremosClase {
  readonly assetClass: string
  /** Cuantos fondos de la clase tienen dato en esta ventana. */
  readonly conDato: number
  readonly total: number
  readonly mejorRetorno: Puesto | null
  readonly peorRetorno: Puesto | null
  readonly mayorDesviacion: Puesto | null
  readonly mejorSharpe: Puesto | null
}

/**
 * Mejor, peor, mas volatil y mejor Sharpe, clase por clase.
 *
 * Es la pregunta que la mesa hace de verdad: no «cual es el mejor fondo» sino
 * «cual es el mejor hedge fund». Comparar un fondo de credito privado contra
 * uno de venture por retorno crudo no dice nada; adentro de la clase, si.
 *
 * Una clase donde nadie llega a la ventana devuelve las cuatro puntas en
 * `null` y `conDato` en cero, en vez de desaparecer de la lista: que una clase
 * entera no tenga historia suficiente es informacion.
 */
export function extremosPorClase(
  fondos: readonly MetricasFondo[],
  ventana: string,
): readonly ExtremosClase[] {
  const clases = [...new Set(fondos.map((f) => f.fondo.assetClass))].sort((a, b) =>
    a.localeCompare(b, 'es'),
  )

  return clases.map((assetClass) => {
    const deLaClase = fondos.filter((f) => f.fondo.assetClass === assetClass)
    const porRetorno = rankear(deLaClase, ventana, 'retorno')
    const porDesviacion = rankear(deLaClase, ventana, 'desviacion')
    const porSharpe = rankear(deLaClase, ventana, 'sharpe')
    const puestos = porRetorno.puestos

    return {
      assetClass,
      conDato: puestos.length,
      total: deLaClase.length,
      mejorRetorno: puestos[0] ?? null,
      peorRetorno: puestos.length > 1 ? (puestos[puestos.length - 1] ?? null) : null,
      mayorDesviacion: porDesviacion.puestos[0] ?? null,
      mejorSharpe: porSharpe.puestos[0] ?? null,
    }
  })
}

/** Un punto del dispersion riesgo-retorno. */
export interface PuntoDispersion {
  readonly fondoId: string
  readonly nombre: string
  readonly assetClass: string
  readonly retorno: number
  readonly desviacion: number
  readonly sharpe: number | null
}

/**
 * Riesgo contra retorno, un punto por fondo.
 *
 * Es el grafico que ordena la conversacion: dos fondos con el mismo retorno y
 * el doble de desviacion no son el mismo producto, y en una tabla de cuarenta
 * columnas eso no se ve. Solo entran los fondos con las dos coordenadas — un
 * punto sin eje no se puede dibujar en el medio y fingir que esta.
 */
export function dispersionRiesgoRetorno(
  fondos: readonly MetricasFondo[],
  ventana: string,
): readonly PuntoDispersion[] {
  const puntos: PuntoDispersion[] = []

  for (const metricas of fondos) {
    const v = ventanaDe(metricas, ventana)
    if (v === null || v.retorno === null || v.desviacion === null) continue

    puntos.push({
      fondoId: metricas.fondo.id,
      nombre: metricas.fondo.nombre,
      assetClass: metricas.fondo.assetClass,
      retorno: v.retorno,
      desviacion: v.desviacion,
      sharpe: v.sharpe,
    })
  }

  return puntos
}

/** El resumen de una clase de activo: como le fue al grupo, no a un fondo. */
export interface ResumenClase {
  readonly assetClass: string
  readonly fondos: number
  readonly conDato: number
  /** Promedio simple de los que tienen dato. No pondera por patrimonio: no lo sabemos. */
  readonly retornoPromedio: number | null
  readonly desviacionPromedio: number | null
  readonly sharpePromedio: number | null
  /** Distancia entre el mejor y el peor retorno de la clase. */
  readonly dispersion: number | null
}

const promedio = (valores: readonly number[]): number | null =>
  valores.length === 0 ? null : valores.reduce((s, v) => s + v, 0) / valores.length

/**
 * Una fila por clase de activo.
 *
 * El promedio es simple y no ponderado, y es a proposito: ponderar por
 * patrimonio invertido pediria un dato que este modulo no tiene: mide fondos,
 * no posiciones de clientes. Un promedio simple dice «como le fue al menu que
 * ofrecemos», que es la pregunta de la mesa.
 *
 * `dispersion` es lo que mas se mira en la practica: una clase con 3 puntos
 * entre el mejor y el peor es una clase donde elegir bien no cambia mucho; una
 * con 30 es una donde elegir es casi todo.
 */
export function resumenPorClase(
  fondos: readonly MetricasFondo[],
  ventana: string,
): readonly ResumenClase[] {
  const clases = [...new Set(fondos.map((f) => f.fondo.assetClass))].sort((a, b) =>
    a.localeCompare(b, 'es'),
  )

  return clases.map((assetClass) => {
    const deLaClase = fondos.filter((f) => f.fondo.assetClass === assetClass)
    const noNulos = (criterio: Criterio) =>
      deLaClase
        .map((f) => valorDe(f, ventana, criterio))
        .filter((v): v is number => v !== null)

    const retornos = noNulos('retorno')

    return {
      assetClass,
      fondos: deLaClase.length,
      conDato: retornos.length,
      retornoPromedio: promedio(retornos),
      desviacionPromedio: promedio(noNulos('desviacion')),
      sharpePromedio: promedio(noNulos('sharpe')),
      dispersion:
        retornos.length < 2 ? null : Math.max(...retornos) - Math.min(...retornos),
    }
  })
}
