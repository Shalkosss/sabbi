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

/** El risk-free vigente. El default replica el escalar que tenia la hoja. */
export async function riskFreeVigente(): Promise<number> {
  const supabase = await clienteServidor()
  const { data } = await supabase
    .from('retornos_parametros')
    .select('risk_free')
    .maybeSingle()

  return data?.risk_free ?? 0.04475
}

/** Los fondos con su serie mensual completa. */
export async function listarFondosConSerie(): Promise<readonly FondoConSerie[]> {
  const supabase = await clienteServidor()

  const [{ data: fondos }, { data: observaciones }] = await Promise.all([
    supabase
      .from('fondos')
      .select('id, nombre, asset_class, inception, guidance_cp, domicilio, activo')
      .order('nombre'),
    supabase
      .from('fondos_observaciones')
      .select('fondo_id, mes, nav, retorno_total')
      .order('mes'),
  ])

  const porFondo = new Map<number, ObservacionMensual[]>()
  for (const fila of observaciones ?? []) {
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
}> {
  const [fondos, riskFree] = await Promise.all([listarFondosConSerie(), riskFreeVigente()])
  const ultimoMes = ultimoMesCargado(fondos)

  // Sin una sola observacion no hay anio de corte que valga; se usa el primero
  // de la lista de anios solo para que la tabla tenga columnas que mostrar.
  const anioTope = ultimoMes === null ? new Date().getUTCFullYear() : Number(ultimoMes.slice(0, 4))

  return {
    metricas: fondos.map((f) =>
      calcularMetricas(f.ficha, f.observaciones, {
        riskFree,
        anioTope,
        aniosAtras: ANIOS_ATRAS,
      }),
    ),
    riskFree,
    ultimoMes,
    fondos,
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
