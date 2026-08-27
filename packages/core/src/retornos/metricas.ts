import type {
  AperturaMensual,
  FichaFondo,
  MetricaAnual,
  MetricaVentana,
  MetricasFondo,
  Mes,
  ObservacionMensual,
  ParametrosMetricas,
} from './tipos.js'
import {
  DESVIACION_MINIMA,
  FACTOR_ANUALIZACION,
  MESES_SIN_ANUALIZAR,
  VENTANAS,
  VENTANAS_CON_RIESGO,
  armarMes,
  partirMes,
} from './ventanas.js'

/**
 * Metricas de retorno, riesgo y Sharpe de un fondo.
 *
 * Es el port de las filas 122 a 141 de la hoja `Distributivos`, verificado
 * contra Blue Owl ORENT: las trece metricas dan bit a bit lo mismo que el
 * Excel. Ver `__tests__/orent.ts`.
 *
 * Todo se calcula sobre la serie de **retorno total**, nunca sobre el NAV. En
 * un fondo distributivo el NAV se mueve poco y el retorno vive en la
 * distribucion; derivar el retorno del NAV borraria justamente lo que la mesa
 * mide. El NAV entra solo para abrir el retorno en capital y distribucion.
 *
 * Funcion pura: no lee el reloj — el anio de corte entra por `parametros` — no
 * toca la red y no ordena en el lugar el arreglo que recibe.
 */

/** Producto compuesto de una serie de retornos: `(1+r1)(1+r2)... - 1`. */
function componer(retornos: readonly number[]): number {
  let acumulado = 1
  for (const retorno of retornos) acumulado *= 1 + retorno
  return acumulado - 1
}

/**
 * Desviacion estandar poblacional, anualizada.
 *
 * Poblacional — entre `n`, no entre `n-1` — porque es lo que usa la hoja
 * (`STDEV.P`) y lo que la mesa ya publico. Con menos de dos observaciones no
 * hay dispersion que medir y devuelve `null` en vez de cero: cero se leeria
 * como «este fondo no tiene riesgo».
 */
function desviacionAnualizada(retornos: readonly number[]): number | null {
  if (retornos.length < 2) return null

  const media = retornos.reduce((suma, r) => suma + r, 0) / retornos.length
  const varianza =
    retornos.reduce((suma, r) => suma + (r - media) ** 2, 0) / retornos.length

  return Math.sqrt(varianza) * FACTOR_ANUALIZACION
}

/**
 * Anualiza un retorno acumulado de `meses` meses.
 *
 * Hasta el anio se devuelve tal cual — ver `MESES_SIN_ANUALIZAR`.
 */
function anualizar(acumulado: number, meses: number): number {
  if (meses <= MESES_SIN_ANUALIZAR) return acumulado
  return (1 + acumulado) ** (12 / meses) - 1
}

/** El mes anterior a uno dado. `null` si el texto no es un mes. */
function mesAnterior(mes: Mes): Mes | null {
  const partido = partirMes(mes)
  if (partido === null) return null
  return partido.mes === 1
    ? armarMes(partido.anio - 1, 12)
    : armarMes(partido.anio, partido.mes - 1)
}

/**
 * Abre el retorno de cada mes en capital y distribucion.
 *
 * `capital` es la variacion del NAV contra el mes inmediatamente anterior;
 * `distribucion` es lo que falta hasta el retorno total. Si el mes anterior no
 * esta en la serie, o le falta el NAV, la apertura queda en `null` los dos:
 * comparar contra un NAV de hace tres meses daria una ganancia de capital
 * trimestral disfrazada de mensual.
 */
export function abrirRetornos(
  observaciones: readonly ObservacionMensual[],
): readonly AperturaMensual[] {
  const navPorMes = new Map<Mes, number>()
  for (const obs of observaciones) {
    if (obs.nav !== null) navPorMes.set(obs.mes, obs.nav)
  }

  return observaciones.map((obs) => {
    const total = obs.retornoTotal
    if (total === null) {
      return { mes: obs.mes, total: null, capital: null, distribucion: null }
    }

    const previo = mesAnterior(obs.mes)
    const navPrevio = previo === null ? undefined : navPorMes.get(previo)

    if (obs.nav === null || navPrevio === undefined || navPrevio === 0) {
      return { mes: obs.mes, total, capital: null, distribucion: null }
    }

    const capital = obs.nav / navPrevio - 1
    return { mes: obs.mes, total, capital, distribucion: total - capital }
  })
}

/** La serie ordenada por mes, quedandose solo con los meses que tienen retorno. */
function serieConDato(
  observaciones: readonly ObservacionMensual[],
): readonly { readonly mes: Mes; readonly retorno: number }[] {
  return observaciones
    .filter(
      (obs): obs is ObservacionMensual & { readonly retornoTotal: number } =>
        obs.retornoTotal !== null && partirMes(obs.mes) !== null,
    )
    .map((obs) => ({ mes: obs.mes, retorno: obs.retornoTotal }))
    .sort((a, b) => a.mes.localeCompare(b.mes))
}

/**
 * Los ultimos `meses` meses de la serie, exigiendo que esten todos.
 *
 * Devuelve `null` si la serie es mas corta o si hay un hueco adentro de la
 * ventana. Un 1Y calculado sobre once meses porque a marzo nadie lo cargo no
 * es un 1Y: es un numero mas chico que se publica con el rotulo equivocado.
 * Preferimos que la celda diga «n/d» y que el hueco se vea en la carga.
 */
function colaCompleta(
  serie: readonly { readonly mes: Mes; readonly retorno: number }[],
  meses: number,
): readonly number[] | null {
  if (serie.length < meses) return null

  const cola = serie.slice(serie.length - meses)
  const primero = cola[0]
  const ultimo = cola[cola.length - 1]
  if (primero === undefined || ultimo === undefined) return null

  const inicio = partirMes(primero.mes)
  const fin = partirMes(ultimo.mes)
  if (inicio === null || fin === null) return null

  // Entre el primero y el ultimo de la cola tiene que haber exactamente
  // `meses` meses calendario. Si hay mas, falta alguno en el medio.
  const distancia = (fin.anio - inicio.anio) * 12 + (fin.mes - inicio.mes) + 1
  if (distancia !== meses) return null

  return cola.map((punto) => punto.retorno)
}

/** Retorno, desviacion y Sharpe de una ventana. */
function metricaDeVentana(
  clave: string,
  retornos: readonly number[] | null,
  riskFree: number,
): MetricaVentana {
  if (retornos === null || retornos.length === 0) {
    return { ventana: clave, retorno: null, desviacion: null, sharpe: null, mesesUsados: 0 }
  }

  const retorno = anualizar(componer(retornos), retornos.length)
  const conRiesgo = VENTANAS_CON_RIESGO.includes(clave)
  const desviacion = conRiesgo ? desviacionAnualizada(retornos) : null
  const sharpe =
    desviacion === null || desviacion < DESVIACION_MINIMA
      ? null
      : (retorno - riskFree) / desviacion

  return { ventana: clave, retorno, desviacion, sharpe, mesesUsados: retornos.length }
}

/** Retornos por anio calendario, del mas reciente al mas viejo. */
function metricasAnuales(
  serie: readonly { readonly mes: Mes; readonly retorno: number }[],
  parametros: ParametrosMetricas,
): readonly MetricaAnual[] {
  const anios: MetricaAnual[] = []

  for (let anio = parametros.anioTope; anio > parametros.anioTope - parametros.aniosAtras; anio--) {
    const delAnio = serie.filter((punto) => punto.mes.startsWith(`${anio}-`))

    if (delAnio.length === 0) {
      anios.push({ anio, retorno: null, parcial: false, mesesUsados: 0 })
      continue
    }

    anios.push({
      anio,
      retorno: componer(delAnio.map((punto) => punto.retorno)),
      parcial: delAnio.length < 12,
      mesesUsados: delAnio.length,
    })
  }

  return anios
}

/**
 * Todas las metricas de un fondo.
 *
 * @param fondo  la ficha, que viaja tal cual al resultado
 * @param observaciones  la serie mensual; no hace falta que venga ordenada
 * @param parametros  risk-free y anios a mostrar. Ningun default acá adentro.
 */
export function calcularMetricas(
  fondo: FichaFondo,
  observaciones: readonly ObservacionMensual[],
  parametros: ParametrosMetricas,
): MetricasFondo {
  const serie = serieConDato(observaciones)
  const apertura = abrirRetornos(
    [...observaciones].sort((a, b) => a.mes.localeCompare(b.mes)),
  )

  const ventanas = VENTANAS.map((ventana) => {
    // Since inception mira la serie entera, huecos incluidos: es lo que hace
    // `COUNT` en la hoja. Las demas exigen la ventana completa.
    const retornos =
      ventana.meses === null
        ? serie.length === 0
          ? null
          : serie.map((punto) => punto.retorno)
        : colaCompleta(serie, ventana.meses)

    return metricaDeVentana(ventana.clave, retornos, parametros.riskFree)
  })

  return {
    fondo,
    primerMes: serie[0]?.mes ?? null,
    ultimoMes: serie[serie.length - 1]?.mes ?? null,
    ventanas,
    anios: metricasAnuales(serie, parametros),
    apertura,
  }
}

/** La metrica de una ventana por su clave. `null` si la ventana no existe. */
export const ventanaDe = (
  metricas: MetricasFondo,
  clave: string,
): MetricaVentana | null => metricas.ventanas.find((v) => v.ventana === clave) ?? null
