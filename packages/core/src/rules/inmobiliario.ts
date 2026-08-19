/**
 * Umbral de Inmobiliario Directo.
 *
 * Port de `ProrratearInmobiliario` de la macro Benchmark Sabbi v8. Es la regla
 * que menos se ve en la especificacion y mas mueve las cifras: por debajo de
 * 500,000 de ticket, la clase inmobiliaria no existe.
 *
 * No es un toggle sino un umbral con escape manual. Se corre despues del solver
 * de pisos y antes de repartir cada clase en instrumentos, igual que en la
 * macro: el objetivo de `inm` se disuelve y su capital se prorratea entre Fijo,
 * Variable y Privados en proporcion a lo que ya tenian. Cash no participa.
 *
 * El escape es el piso: un inmueble que el cliente conserva, o una restriccion
 * del asesor sobre la clase, la clavan y la regla no se aplica. En la macro son
 * la misma cosa — las posiciones conservadas entran como restricciones — y aqui
 * tambien: ambas llegan como piso de la clase.
 */

import type { ClaseModelo, RepartoClase, ResultadoReparto } from '../domain/tipos.js'

/** Debajo de este ticket, Inmobiliario Directo se disuelve. */
export const UMBRAL_INMOBILIARIO = 500_000

/**
 * Las clases que absorben el capital del inmobiliario disuelto.
 *
 * En la macro eran Fijo, Variable y Privados; Club y Otros entran porque antes
 * vivian dentro de Privados y el prorrateo proporcional les daba su parte a
 * traves de la clase madre. Cash sigue sin participar.
 */
const RECEPTORAS: ReadonlySet<ClaseModelo> = new Set([
  'fijo',
  'variable',
  'privados',
  'club',
  'otros',
])

const EPS = 1e-6
const TOL = 0.01

export interface OpcionesInmobiliario {
  /** Ticket de la propuesta: el patrimonio invertible total. */
  readonly patrimonioTotalUsd: number
  /** Fuerza la conservacion de la clase aunque el ticket no llegue al umbral. */
  readonly inmFijado?: boolean
}

/**
 * Disuelve Inmobiliario Directo y prorratea su capital, si corresponde.
 *
 * Devuelve el reparto intacto cuando la regla no aplica, de modo que el llamador
 * puede invocarla siempre sin preguntar.
 */
export function prorratearInmobiliario(
  reparto: ResultadoReparto,
  opciones: OpcionesInmobiliario,
): ResultadoReparto {
  const { patrimonioTotalUsd, inmFijado = false } = opciones

  if (patrimonioTotalUsd >= UMBRAL_INMOBILIARIO) return reparto

  const inm = reparto.porClase.find((c) => c.clase === 'inm')
  if (!inm || inm.objetivoUsd <= EPS) return reparto
  if (inmFijado || inm.pisoUsd > EPS) return reparto

  const base = reparto.porClase.reduce(
    (acc, c) => (RECEPTORAS.has(c.clase) ? acc + c.objetivoUsd : acc),
    0,
  )
  if (base <= EPS) return reparto

  const factor = (base + inm.objetivoUsd) / base

  const porClase: RepartoClase[] = reparto.porClase.map((c) => {
    if (c.clase === 'inm') {
      return { ...c, objetivoUsd: 0, dineroNuevoUsd: 0, cerrada: true }
    }
    if (!RECEPTORAS.has(c.clase)) return c

    const objetivoUsd = c.objetivoUsd * factor
    return {
      ...c,
      objetivoUsd,
      dineroNuevoUsd: Math.max(0, objetivoUsd - c.pisoUsd),
      // Una clase que estaba cerrada en su piso deja de estarlo al recibir
      // capital nuevo del inmobiliario.
      cerrada: objetivoUsd <= c.pisoUsd + TOL,
    }
  })

  return { ...reparto, porClase }
}
