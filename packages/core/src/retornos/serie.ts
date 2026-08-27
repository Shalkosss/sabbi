import type { Mes, ObservacionMensual } from './tipos.js'
import { armarMes, partirMes, rangoDeMeses } from './ventanas.js'

/**
 * La serie de un fondo mirada mes a mes.
 *
 * `metricas.ts` contesta «cuanto rindio este fondo en 3Y». Este archivo
 * contesta lo otro que la mesa pregunta y la hoja nunca supo mostrar: como
 * llego hasta ahi. Crecimiento compuesto, cuanto perdio desde su mejor momento
 * y cuantos meses seguidos viene en verde.
 *
 * Misma regla de la casa: funcion pura, sin red, sin DOM, sin reloj. Todo lo
 * que necesita saber del calendario entra como argumento.
 */

/** Un punto de la curva de crecimiento. */
export interface PuntoCrecimiento {
  readonly mes: Mes
  /** Cuanto vale una unidad invertida al inicio de la serie. Arranca en 1. */
  readonly indice: number
  /** El retorno del mes que llevo hasta acá. `null` en el punto de partida. */
  readonly retorno: number | null
  /** Caida contra el maximo previo de la curva, como fraccion negativa o cero. */
  readonly drawdown: number
}

/**
 * La curva de crecimiento compuesto de una serie, base 1.
 *
 * Es lo que un grafico de retornos mensuales no puede decir: doce barras de
 * 0.8% y una de -9% se ven casi iguales de lejos, y la curva las separa.
 *
 * Los meses sin retorno publicado **no cortan la curva ni valen cero**: se
 * saltean. Un hueco en la carga no es un mes plano, y dibujarlo plano inventa
 * una observacion que nadie hizo.
 *
 * El primer punto es el mes anterior al primero con dato, con indice 1: sin el
 * la curva arranca ya movida y el primer mes queda invisible.
 */
export function crecimiento(
  observaciones: readonly ObservacionMensual[],
): readonly PuntoCrecimiento[] {
  const conDato = [...observaciones]
    .filter((o) => o.retornoTotal !== null)
    .sort((a, b) => a.mes.localeCompare(b.mes))

  if (conDato.length === 0) return []

  const arranque = mesAnterior(conDato[0]!.mes)
  const puntos: PuntoCrecimiento[] = [
    { mes: arranque ?? conDato[0]!.mes, indice: 1, retorno: null, drawdown: 0 },
  ]

  let indice = 1
  let techo = 1

  for (const obs of conDato) {
    indice *= 1 + obs.retornoTotal!
    techo = Math.max(techo, indice)
    puntos.push({
      mes: obs.mes,
      indice,
      retorno: obs.retornoTotal,
      drawdown: indice / techo - 1,
    })
  }

  return puntos
}

/** El peor punto de la curva y cuando ocurrio. */
export interface Caida {
  /** Fraccion negativa. Cero si la curva nunca estuvo bajo su maximo. */
  readonly profundidad: number
  /** Mes del piso. `null` si no hubo caida. */
  readonly mes: Mes | null
  /** Mes del maximo desde el que cayo. `null` si no hubo caida. */
  readonly desde: Mes | null
  /** Meses que tardo en recuperar el maximo. `null` si todavia no lo recupero. */
  readonly recuperoEn: number | null
}

/**
 * El maximo drawdown de la serie: cuanto llego a perder quien entro en el peor
 * momento posible.
 *
 * Es la cifra de riesgo que la mesa entiende sin traduccion. Una desviacion de
 * 6% no le dice nada a un cliente; «llego a estar 18% abajo y tardo catorce
 * meses en volver» si.
 */
export function maximaCaida(observaciones: readonly ObservacionMensual[]): Caida {
  const curva = crecimiento(observaciones)
  const vacia: Caida = { profundidad: 0, mes: null, desde: null, recuperoEn: null }
  if (curva.length === 0) return vacia

  let techo = curva[0]!.indice
  let mesDelTecho = curva[0]!.mes
  let peor = vacia

  for (const punto of curva) {
    if (punto.indice >= techo) {
      techo = punto.indice
      mesDelTecho = punto.mes
      continue
    }
    if (punto.drawdown < peor.profundidad) {
      peor = {
        profundidad: punto.drawdown,
        mes: punto.mes,
        desde: mesDelTecho,
        recuperoEn: null,
      }
    }
  }

  if (peor.mes === null) return vacia

  // La recuperacion se cuenta desde el piso, no desde el techo: lo que la mesa
  // pregunta es cuanto hay que esperar despues de ver la peor cifra.
  const piso = curva.findIndex((p) => p.mes === peor.mes)
  const techoPrevio = curva.find((p) => p.mes === peor.desde)?.indice ?? 1
  const vuelta = curva.slice(piso + 1).findIndex((p) => p.indice >= techoPrevio)

  return { ...peor, recuperoEn: vuelta === -1 ? null : vuelta + 1 }
}

/** Lo que se lee de un vistazo sobre la serie entera de un fondo. */
export interface ResumenSerie {
  readonly meses: number
  readonly positivos: number
  readonly negativos: number
  /** Fraccion de meses en verde. `null` sin un solo mes con dato. */
  readonly aciertos: number | null
  readonly mejor: { readonly mes: Mes; readonly retorno: number } | null
  readonly peor: { readonly mes: Mes; readonly retorno: number } | null
  /** Meses consecutivos en verde al cierre de la serie. */
  readonly rachaActual: number
  readonly caida: Caida
  /** Meses del rango que no tienen retorno cargado. El hueco se informa. */
  readonly huecos: number
}

/**
 * El resumen de una serie.
 *
 * `huecos` es la unica cifra de esta funcion que no habla del fondo sino de la
 * carga: cuenta los meses que hay entre el primero y el ultimo con dato y
 * nadie lleno. Sin eso, una serie con la mitad de los meses vacios publica un
 * «68% de meses en verde» que se lee como si fueran todos.
 */
export function resumirSerie(observaciones: readonly ObservacionMensual[]): ResumenSerie {
  const conDato = [...observaciones]
    .filter((o) => o.retornoTotal !== null)
    .sort((a, b) => a.mes.localeCompare(b.mes))

  const vacio: ResumenSerie = {
    meses: 0,
    positivos: 0,
    negativos: 0,
    aciertos: null,
    mejor: null,
    peor: null,
    rachaActual: 0,
    caida: { profundidad: 0, mes: null, desde: null, recuperoEn: null },
    huecos: 0,
  }
  if (conDato.length === 0) return vacio

  let positivos = 0
  let negativos = 0
  let mejor = conDato[0]!
  let peor = conDato[0]!

  for (const obs of conDato) {
    const retorno = obs.retornoTotal!
    if (retorno > 0) positivos += 1
    if (retorno < 0) negativos += 1
    if (retorno > mejor.retornoTotal!) mejor = obs
    if (retorno < peor.retornoTotal!) peor = obs
  }

  let racha = 0
  for (let i = conDato.length - 1; i >= 0; i -= 1) {
    if (conDato[i]!.retornoTotal! <= 0) break
    racha += 1
  }

  const cubiertos = rangoDeMeses(conDato[0]!.mes, conDato[conDato.length - 1]!.mes).length

  return {
    meses: conDato.length,
    positivos,
    negativos,
    aciertos: positivos / conDato.length,
    mejor: { mes: mejor.mes, retorno: mejor.retornoTotal! },
    peor: { mes: peor.mes, retorno: peor.retornoTotal! },
    rachaActual: racha,
    caida: maximaCaida(conDato),
    huecos: cubiertos - conDato.length,
  }
}

/** Una fila de la matriz: un mes, con lo que cada fondo publico ese mes. */
export interface FilaMatriz {
  readonly mes: Mes
  /** El retorno de cada fondo, por id. Un fondo sin dato no tiene entrada. */
  readonly retornos: ReadonlyMap<string, number>
  /** Cuantos fondos del universo tienen dato este mes. */
  readonly cargados: number
  /** Mediana de los retornos del mes. `null` si nadie cargo. */
  readonly mediana: number | null
}

/**
 * La hoja `Distributivos` tal como se ve: un mes por fila, un fondo por
 * columna.
 *
 * Es la unica vista que contesta «que paso en noviembre», y ninguna tabla de
 * metricas puede contestarla — las metricas colapsan el mes adentro de una
 * ventana. Es tambien la unica forma razonable de cargar: quien tiene el
 * reporte del mes abierto lo copia en una fila, no en cuarenta pantallas.
 *
 * Los meses vienen todos, incluidos los que nadie cargo: el hueco es
 * justamente lo que hay que ver para llenarlo.
 */
export function matrizMensual(
  series: ReadonlyMap<string, readonly ObservacionMensual[]>,
  desde: Mes,
  hasta: Mes,
): readonly FilaMatriz[] {
  const porMes = new Map<Mes, Map<string, number>>()

  for (const [fondoId, observaciones] of series) {
    for (const obs of observaciones) {
      if (obs.retornoTotal === null) continue
      const fila = porMes.get(obs.mes) ?? new Map<string, number>()
      fila.set(fondoId, obs.retornoTotal)
      porMes.set(obs.mes, fila)
    }
  }

  return rangoDeMeses(desde, hasta).map((mes) => {
    const retornos = porMes.get(mes) ?? new Map<string, number>()
    return {
      mes,
      retornos,
      cargados: retornos.size,
      mediana: mediana([...retornos.values()]),
    }
  })
}

/**
 * La mediana y no el promedio.
 *
 * Un mes con un fondo de venture en -40% mueve el promedio del universo entero
 * y la fila de resumen deja de describir al mes. La mediana no.
 */
export function mediana(valores: readonly number[]): number | null {
  if (valores.length === 0) return null

  const ordenados = [...valores].sort((a, b) => a - b)
  const medio = Math.floor(ordenados.length / 2)

  return ordenados.length % 2 === 1
    ? ordenados[medio]!
    : (ordenados[medio - 1]! + ordenados[medio]!) / 2
}

/** El mes anterior a uno dado. `null` si el texto no es un mes. */
function mesAnterior(mes: Mes): Mes | null {
  const partido = partirMes(mes)
  if (partido === null) return null
  return partido.mes === 1
    ? armarMes(partido.anio - 1, 12)
    : armarMes(partido.anio, partido.mes - 1)
}
