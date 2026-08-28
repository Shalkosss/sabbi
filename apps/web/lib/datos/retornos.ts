import 'server-only'

import { calcularMetricas } from '@sabbi/core'
import type { FichaFondo, MetricasFondo, Mes, ObservacionMensual } from '@sabbi/core'

import { clienteServidor } from '../supabase/servidor'

/**
 * Lectura de los retornos de fondos.
 *
 * La base guarda dos cosas — el fondo y su observacion mensual — y nada
 * derivado. Todas las metricas se calculan acá, en la lectura, llamando al
 * motor puro. Es a proposito: una metrica guardada se desincroniza el dia que
 * alguien corrige un NAV de hace seis meses, y corregir un NAV viejo es la
 * operacion mas comun de todas.
 *
 * Son ~40 fondos por ~100 meses. Recalcular todo en cada carga de pantalla son
 * unos pocos miles de multiplicaciones: mucho mas barato que el viaje a la
 * base que las traeria cacheadas.
 */

export interface FondoConSerie {
  readonly ficha: FichaFondo
  readonly activo: boolean
  readonly observaciones: readonly ObservacionMensual[]
}

/** Cuantos anios calendario muestra la tabla. La hoja llegaba hasta 2019. */
const ANIOS_ATRAS = 8

/**
 * El risk-free de respaldo: la tasa que se usa cuando `treasury_10y` no tiene
 * el mes en que termina la serie de un fondo. La habitual sale de esa serie.
 */
export async function riskFreeVigente(): Promise<number> {
  const supabase = await clienteServidor()
  const { data } = await supabase
    .from('retornos_parametros')
    .select('risk_free')
    .maybeSingle()

  return data?.risk_free ?? 0.04475
}

/**
 * Cuantas filas pide cada viaje al traer las observaciones.
 *
 * PostgREST corta toda respuesta en mil filas y no avisa: devuelve las mil
 * primeras del orden pedido y un `data` que parece completo. Con la serie
 * ordenada por mes eso entregaba desde 2008 hasta la mil, y todo lo reciente
 * llegaba vacio — la matriz sin una sola celda y las metricas calculadas sobre
 * una serie truncada. Por eso se pagina a mano hasta que un tramo vuelve corto.
 */
const TRAMO = 1000

interface FilaObservacion {
  readonly fondo_id: number
  readonly mes: Mes
  readonly nav: number | null
  readonly retorno_total: number | null
}

/**
 * Toda la tabla de observaciones, de a mil.
 *
 * El orden lleva `fondo_id` de desempate: paginar por un campo con repetidos
 * —hay sesenta y cuatro filas por mes— deja el corte de cada tramo a merced
 * del orden que devuelva el motor, y ahi se pierden o se duplican filas.
 */
async function todasLasObservaciones(
  supabase: Awaited<ReturnType<typeof clienteServidor>>,
): Promise<readonly FilaObservacion[]> {
  const todas: FilaObservacion[] = []

  for (let desde = 0; ; desde += TRAMO) {
    const { data, error } = await supabase
      .from('fondos_observaciones')
      .select('fondo_id, mes, nav, retorno_total')
      .order('mes')
      .order('fondo_id')
      .range(desde, desde + TRAMO - 1)

    if (error !== null) throw new Error(`No se pudieron leer las observaciones: ${error.message}`)

    const tramo = (data ?? []) as FilaObservacion[]
    todas.push(...tramo)
    if (tramo.length < TRAMO) return todas
  }
}

/** Los fondos con su serie mensual completa. */
export async function listarFondosConSerie(): Promise<readonly FondoConSerie[]> {
  const supabase = await clienteServidor()

  const [{ data: fondos }, observaciones] = await Promise.all([
    supabase
      .from('fondos')
      .select('id, nombre, asset_class, inception, guidance_cp, domicilio, activo, es_referencia')
      .order('nombre'),
    todasLasObservaciones(supabase),
  ])

  const porFondo = new Map<number, ObservacionMensual[]>()
  for (const fila of observaciones) {
    const serie = porFondo.get(fila.fondo_id) ?? []
    serie.push({ mes: fila.mes, nav: fila.nav, retornoTotal: fila.retorno_total })
    porFondo.set(fila.fondo_id, serie)
  }

  return (fondos ?? []).map((fila) => ({
    ficha: {
      id: String(fila.id),
      nombre: fila.nombre,
      assetClass: fila.asset_class,
      inception: fila.inception,
      guidanceCortoPlazo: fila.guidance_cp,
      domicilio: fila.domicilio,
      esReferencia: fila.es_referencia,
    },
    activo: fila.activo,
    observaciones: porFondo.get(fila.id) ?? [],
  }))
}

/**
 * El mes mas reciente con alguna observacion cargada.
 *
 * Es lo que fija el anio de corte del calculo. Sale del dato y no del reloj:
 * si la mesa esta atrasada dos meses, la columna «2026» tiene que decir lo que
 * la serie sostiene, no abrirse en un anio vacio porque el calendario avanzo.
 */
export const ultimoMesCargado = (fondos: readonly FondoConSerie[]): Mes | null => {
  let ultimo: Mes | null = null
  for (const fondo of fondos) {
    for (const obs of fondo.observaciones) {
      if (obs.retornoTotal === null) continue
      if (ultimo === null || obs.mes > ultimo) ultimo = obs.mes
    }
  }
  return ultimo
}

/** Las metricas de todos los fondos, ya calculadas. */
export async function metricasDeFondos(): Promise<{
  readonly metricas: readonly MetricasFondo[]
  readonly riskFree: number
  readonly ultimoMes: Mes | null
  readonly fondos: readonly FondoConSerie[]
  /** Cuantos fondos cayeron al respaldo por no tener su mes de corte cargado. */
  readonly sinTreasury: number
}> {
  const [fondos, riskFree, treasury] = await Promise.all([
    listarFondosConSerie(),
    riskFreeVigente(),
    serieTreasury(),
  ])
  const ultimoMes = ultimoMesCargado(fondos)

  // Sin una sola observacion no hay anio de corte que valga; se usa el primero
  // de la lista de anios solo para que la tabla tenga columnas que mostrar.
  const anioTope = ultimoMes === null ? new Date().getUTCFullYear() : Number(ultimoMes.slice(0, 4))

  // El Sharpe de cada fondo se mide contra el Treasury del mes en que termina
  // SU serie, no contra uno comun a la tabla. Ver `ParametrosMetricas`.
  const riskFreePorMes = new Map(treasury.map((t) => [t.mes, t.cierre]))

  const metricas = fondos.map((f) =>
    calcularMetricas(f.ficha, f.observaciones, {
      riskFree,
      riskFreePorMes,
      anioTope,
      aniosAtras: ANIOS_ATRAS,
    }),
  )

  return {
    metricas,
    riskFree,
    ultimoMes,
    fondos,
    sinTreasury: metricas.filter((m) => m.ultimoMes !== null && m.mesDelRiskFree === null).length,
  }
}

/** Las clases con las que se agrupan los fondos. */
export async function clasesDeFondos(): Promise<readonly string[]> {
  const supabase = await clienteServidor()
  const { data } = await supabase.from('fondos_clases').select('nombre').order('orden')
  return (data ?? []).map((f) => f.nombre)
}

/** La serie de Treasury 10Y, del mes mas reciente al mas viejo. */
export async function serieTreasury(): Promise<
  readonly { readonly mes: Mes; readonly cierre: number }[]
> {
  const supabase = await clienteServidor()
  const { data } = await supabase
    .from('treasury_10y')
    .select('mes, cierre')
    .order('mes', { ascending: false })

  return data ?? []
}
