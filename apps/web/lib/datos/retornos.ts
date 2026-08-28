import 'server-only'

import { calcularMetricas } from '@sabbi/core'
import type { MetricasFondo, Mes, ObservacionMensual } from '@sabbi/core'

import { diagnosticar } from '../retornos'
import type { FaltaRetornos, FondoConSerie } from '../retornos'
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

/*
 * El criterio de «por qué está vacía» vive en `../retornos`, que es código puro
 * y se prueba sin base. Se re-exporta desde acá porque las pantallas leen los
 * datos por este módulo y pedirles dos importaciones para una sola lectura solo
 * multiplica los sitios donde se puede equivocar la ruta.
 */
export { diagnosticar } from '../retornos'
export type { FaltaRetornos, FondoConSerie } from '../retornos'

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
 * Los fondos con su serie mensual completa, y lo que salió mal si algo salió mal.
 *
 * El error viaja de vuelta en vez de convertirse en una lista vacía. Un
 * `select` a una tabla que no existe —porque la migración no se aplicó— y un
 * `select` a una tabla vacía devuelven los dos `data: null`, y la pantalla no
 * tiene forma de distinguirlos si aquí se descarta el `error`.
 */
export async function fondosConSerie(): Promise<{
  readonly fondos: readonly FondoConSerie[]
  readonly error: string | null
}> {
  const supabase = await clienteServidor()

  const [{ data: fondos, error: errorFondos }, { data: observaciones, error: errorObs }] =
    await Promise.all([
      supabase
        .from('fondos')
        .select('id, nombre, asset_class, inception, guidance_cp, domicilio, activo, es_referencia')
        .order('nombre'),
      supabase
        .from('fondos_observaciones')
        .select('fondo_id, mes, nav, retorno_total')
        .order('mes'),
    ])

  const error = errorFondos?.message ?? errorObs?.message ?? null

  const porFondo = new Map<number, ObservacionMensual[]>()
  for (const fila of observaciones ?? []) {
    const serie = porFondo.get(fila.fondo_id) ?? []
    serie.push({ mes: fila.mes, nav: fila.nav, retornoTotal: fila.retorno_total })
    porFondo.set(fila.fondo_id, serie)
  }

  return {
    error,
    fondos: (fondos ?? []).map((fila) => ({
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
    })),
  }
}

/** Los fondos a secas, para quien no necesita el diagnóstico. */
export const listarFondosConSerie = async (): Promise<readonly FondoConSerie[]> =>
  (await fondosConSerie()).fondos

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
  /** Por que la tabla esta vacia, cuando lo esta. `null` es que hay datos. */
  readonly falta: FaltaRetornos
}> {
  const [leidos, riskFree, treasury] = await Promise.all([
    fondosConSerie(),
    riskFreeVigente(),
    serieTreasury(),
  ])
  const { fondos } = leidos
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
    falta: diagnosticar(leidos.error, fondos),
  }
}

/**
 * Las clases con las que se agrupan los fondos.
 *
 * Sin clases el filtro de la tabla queda vacio pero la tabla se ve igual, asi
 * que aca el error si se puede callar: no cambia lo que el asesor tiene que
 * hacer. El de los fondos no — ese decide si la pantalla esta vacia.
 */
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
