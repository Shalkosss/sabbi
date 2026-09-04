import { crecimiento, maximaCaida } from '../retornos/serie.js'
import type { Mes, ObservacionMensual } from '../retornos/tipos.js'
import { FACTOR_ANUALIZACION, MESES_SIN_ANUALIZAR, rangoDeMeses } from '../retornos/ventanas.js'
import type {
  ClaseAllocation,
  Escenario,
  Metricas,
  Portafolio,
  Reparto,
  ResultadoEscenario,
  SeriesPorClase,
} from './tipos.js'

/**
 * Armar el portafolio, medirlo y compararlo.
 *
 * Los dos portafolios de la pantalla —el clásico y el clásico con
 * alternativos— salen de la misma función con distinta asignación, y se miden
 * con el mismo código. Es la única forma de que la fila de abajo y la de
 * arriba de la tabla sean comparables: dos caminos de cálculo distintos
 * producen dos diferencias, la real y la del método, y nadie puede separarlas
 * después.
 */

/** Debajo de esto un peso es cero y la clase no entra al cálculo. */
const EPS = 1e-9

/**
 * Mezclar el reparto clásico con el sleeve de alternativos.
 *
 * `asignacion` es cuánto del portafolio total va a alternativos. El resto
 * queda para las clases públicas, que conservan entre sí la proporción del
 * perfil: un 60/40 al que se le sacan 20 puntos queda 48/32 y no 40/40. Es lo
 * que hace la pantalla de referencia y es lo único razonable — cambiar la
 * relación entre renta variable y renta fija sería cambiar el perfil del
 * cliente sin avisarle, que es otra decisión y no la que el slider toma.
 *
 * Los pesos de `mezcla` se normalizan por su suma en vez de exigir que sumen
 * uno: la mesa los edita a mano y un 39.9% guardado no puede hacer que la
 * torta no cierre.
 */
export function mezclar(base: Reparto, mezcla: Reparto, asignacion: number): Reparto {
  const parte = Math.min(Math.max(asignacion, 0), 1)

  const sumaBase = suma(base)
  const sumaMezcla = suma(mezcla)

  const reparto = new Map<ClaseAllocation, number>()

  if (sumaBase > EPS) {
    for (const [clase, peso] of base) {
      reparto.set(clase, (peso / sumaBase) * (1 - parte))
    }
  }

  if (sumaMezcla > EPS && parte > EPS) {
    for (const [clase, peso] of mezcla) {
      const suyo = (peso / sumaMezcla) * parte
      reparto.set(clase, (reparto.get(clase) ?? 0) + suyo)
    }
  }

  // Una clase que quedó en cero no es una porción de la torta: es una porción
  // que no existe, y dibujarla mete una leyenda con «0%» en la lista.
  for (const [clase, peso] of reparto) {
    if (peso <= EPS) reparto.delete(clase)
  }

  return reparto
}

/** El portafolio con sus clases sin serie ya identificadas. */
export function armar(nombre: string, reparto: Reparto, series: SeriesPorClase): Portafolio {
  const faltan = [...reparto.keys()].filter((clase) => {
    const serie = series.get(clase)
    return serie === undefined || serie.every((o) => o.retornoTotal === null)
  })

  return { nombre, reparto, faltan }
}

/**
 * La serie mensual del portafolio: el promedio ponderado de sus clases.
 *
 * Rebalanceo mensual, que es lo que hace un promedio ponderado con pesos
 * fijos. No es un detalle menor y conviene dejarlo escrito: un portafolio que
 * se deja correr sin rebalancear termina con el peso de la clase que más
 * subió, y a diez años eso es otra cosa que lo que la torta dice. La torta
 * dice pesos objetivo, así que la serie los mantiene.
 *
 * Solo entran los meses en los que **todas** las clases con peso publicaron
 * retorno. Un mes al que le falta una clase no es un mes en el que esa clase
 * rindió cero; medirlo así le regala al portafolio la volatilidad que no
 * tuvo. Esa intersección es la ventana común, y es la razón por la que esta
 * pantalla no puede arrancar en 2008 mientras la serie más corta arranque en
 * 2021.
 */
export function serieDelPortafolio(
  reparto: Reparto,
  series: SeriesPorClase,
): readonly ObservacionMensual[] {
  const clases = [...reparto.entries()].filter(([, peso]) => peso > EPS)
  if (clases.length === 0) return []

  const porClase = new Map<ClaseAllocation, Map<Mes, number>>()
  for (const [clase] of clases) {
    const serie = series.get(clase)
    if (serie === undefined) return []

    const porMes = new Map<Mes, number>()
    for (const obs of serie) {
      if (obs.retornoTotal !== null) porMes.set(obs.mes, obs.retornoTotal)
    }
    if (porMes.size === 0) return []

    porClase.set(clase, porMes)
  }

  const ventana = ventanaComun(reparto, series)
  if (ventana === null) return []

  const observaciones: ObservacionMensual[] = []
  for (const mes of rangoDeMeses(ventana.desde, ventana.hasta)) {
    let retorno = 0
    let completo = true

    for (const [clase, peso] of clases) {
      const suyo = porClase.get(clase)!.get(mes)
      if (suyo === undefined) {
        completo = false
        break
      }
      retorno += peso * suyo
    }

    // El hueco se saltea, no se rellena. Un mes que una clase no publicó no
    // entra a la curva ni a la volatilidad, igual que en `crecimiento`.
    if (completo) observaciones.push({ mes, nav: null, retornoTotal: retorno })
  }

  return observaciones
}

/**
 * El primer y el último mes que todas las clases con peso tienen cubierto.
 *
 * `null` cuando alguna clase no tiene serie, o cuando las series no se
 * solapan: dos clases sin un mes en común no forman un portafolio medible, y
 * devolver el rango de la más larga sería medir a la otra donde no existe.
 */
export function ventanaComun(
  reparto: Reparto,
  series: SeriesPorClase,
): { readonly desde: Mes; readonly hasta: Mes } | null {
  const arranques: Mes[] = []
  const cierres: Mes[] = []

  for (const [clase, peso] of reparto) {
    if (peso <= EPS) continue

    const conDato = (series.get(clase) ?? [])
      .filter((o) => o.retornoTotal !== null)
      .map((o) => o.mes)
      .sort((a, b) => a.localeCompare(b))

    if (conDato.length === 0) return null

    arranques.push(conDato[0]!)
    cierres.push(conDato[conDato.length - 1]!)
  }

  if (arranques.length === 0) return null

  // El arranque es el mas tardio de todos y el cierre el mas temprano: la
  // interseccion de las series, no la union.
  const desde = arranques.reduce((tarde, mes) => (mes > tarde ? mes : tarde))
  const hasta = cierres.reduce((temprano, mes) => (mes < temprano ? mes : temprano))

  return desde > hasta ? null : { desde, hasta }
}

/**
 * Las series recortadas a una ventana.
 *
 * Existe para lo único que importa de la tabla: los dos portafolios tienen que
 * medirse sobre los mismos meses. El clasico suele tener mucha mas historia
 * que el que lleva alternativos —el S&P arranca en 2008 y el indice de hedge
 * funds en 2021— y publicar 661% al lado de 90% invita a leer una diferencia
 * de portafolio donde hay una diferencia de epoca.
 *
 * Recortar el largo al corto y no al reves: el corto no se puede estirar.
 */
export function recortar(series: SeriesPorClase, desde: Mes, hasta: Mes): SeriesPorClase {
  const recortadas = new Map<ClaseAllocation, readonly ObservacionMensual[]>()

  for (const [clase, serie] of series) {
    recortadas.set(
      clase,
      serie.filter((o) => o.mes >= desde && o.mes <= hasta),
    )
  }

  return recortadas
}

/**
 * Las cuatro cifras de la tabla, sobre la serie del portafolio.
 *
 * Todo se calcula sobre la misma serie: el acumulado y el anualizado son la
 * misma cifra en dos unidades, y la volatilidad y la caída salen de los mismos
 * meses. Publicar el retorno de una ventana y la volatilidad de otra es como
 * la hoja vieja producía comparaciones que no comparaban.
 *
 * Con un portafolio al que le falta una clase devuelve todo en `null` y no una
 * versión parcial: media tabla llena se lee como una tabla, y la mitad
 * faltante desaparece.
 */
export function medir(portafolio: Portafolio, series: SeriesPorClase): Metricas {
  const vacio: Metricas = {
    desde: null,
    hasta: null,
    meses: 0,
    acumulado: null,
    anualizado: null,
    volatilidad: null,
    maximaCaida: null,
    caidaDesde: null,
    caidaHasta: null,
  }

  if (portafolio.faltan.length > 0) return vacio

  const serie = serieDelPortafolio(portafolio.reparto, series)
  if (serie.length === 0) return vacio

  const retornos = serie.map((o) => o.retornoTotal!)
  const acumulado = componer(retornos)
  const caida = maximaCaida(serie)

  return {
    desde: serie[0]!.mes,
    hasta: serie[serie.length - 1]!.mes,
    meses: serie.length,
    acumulado,
    anualizado: anualizar(acumulado, serie.length),
    volatilidad: desviacionAnualizada(retornos),
    maximaCaida: caida.mes === null ? 0 : caida.profundidad,
    caidaDesde: caida.desde,
    caidaHasta: caida.mes,
  }
}

/**
 * La curva de crecimiento de un monto, mes a mes.
 *
 * Es `crecimiento()` en dólares: la misma curva base 1 multiplicada por el
 * monto. Se pasa el monto en vez de clavarlo porque el «USD 100,000» de la
 * pantalla es una convención de presentación, no del cálculo.
 */
export function curva(
  portafolio: Portafolio,
  series: SeriesPorClase,
  montoInicial: number,
): readonly { readonly mes: Mes; readonly valor: number }[] {
  if (portafolio.faltan.length > 0) return []

  return crecimiento(serieDelPortafolio(portafolio.reparto, series)).map((punto) => ({
    mes: punto.mes,
    valor: punto.indice * montoInicial,
  }))
}

/**
 * Lo que el portafolio hizo en cada ventana con nombre.
 *
 * Un escenario que la serie no cubre entero devuelve `null` y se marca
 * `fueraDeSerie`. Componer los meses que sí están y publicarlo como «la crisis
 * financiera» sería contestar por seis meses una pregunta de dieciocho.
 */
export function correrEscenarios(
  portafolio: Portafolio,
  series: SeriesPorClase,
  escenarios: readonly Escenario[],
): readonly ResultadoEscenario[] {
  const serie = portafolio.faltan.length > 0 ? [] : serieDelPortafolio(portafolio.reparto, series)
  const porMes = new Map(serie.map((o) => [o.mes, o.retornoTotal!]))

  return escenarios.map((escenario) => {
    const meses = rangoDeMeses(escenario.desde, escenario.hasta)
    const retornos = meses.map((mes) => porMes.get(mes))

    if (retornos.some((r) => r === undefined)) {
      return { escenario, retorno: null, fueraDeSerie: true }
    }

    return { escenario, retorno: componer(retornos as number[]), fueraDeSerie: false }
  })
}

/**
 * Las cuatro ventanas que la mesa mira.
 *
 * Son fechas de hechos, no parámetros del modelo: nadie va a «calibrar» cuándo
 * fue la crisis financiera, así que no van a la base. Entran igual como
 * argumento a `correrEscenarios` para que la pantalla pueda mostrar otras sin
 * tocar esta función.
 */
export const ESCENARIOS: readonly Escenario[] = [
  { nombre: 'Crisis financiera global', desde: '2008-09', hasta: '2009-03' },
  { nombre: 'Rebote de los mercados', desde: '2009-06', hasta: '2009-09' },
  { nombre: 'Pandemia', desde: '2019-12', hasta: '2020-03' },
  { nombre: 'Presión inflacionaria', desde: '2021-03', hasta: '2021-06' },
]

/** Producto compuesto: `(1+r1)(1+r2)... - 1`. */
function componer(retornos: readonly number[]): number {
  let acumulado = 1
  for (const retorno of retornos) acumulado *= 1 + retorno
  return acumulado - 1
}

/**
 * Anualiza el acumulado de una ventana de `meses` meses.
 *
 * Una ventana que no llega al año no se anualiza: proyectar cuatro meses a una
 * tasa anual publica una cifra que nadie vivió. Mismo criterio que
 * `retornos/metricas.ts` para las ventanas cortas.
 */
function anualizar(acumulado: number, meses: number): number {
  if (meses <= 0 || meses <= MESES_SIN_ANUALIZAR) return acumulado
  return (1 + acumulado) ** (12 / meses) - 1
}

/**
 * Desviación estándar poblacional, anualizada.
 *
 * Poblacional —entre `n`— por lo mismo que en `retornos/metricas.ts`: es lo
 * que usaba la hoja y lo que la mesa ya publicó. Dos criterios de desviación
 * en la misma app producen dos volatilidades para el mismo fondo.
 */
function desviacionAnualizada(retornos: readonly number[]): number | null {
  if (retornos.length < 2) return null

  const media = retornos.reduce((s, r) => s + r, 0) / retornos.length
  const varianza = retornos.reduce((s, r) => s + (r - media) ** 2, 0) / retornos.length

  return Math.sqrt(varianza) * FACTOR_ANUALIZACION
}

const suma = (reparto: Reparto): number => [...reparto.values()].reduce((s, p) => s + p, 0)
