/**
 * Umbral de Inmobiliario Directo.
 *
 * Port de `ProrratearInmobiliario` de la macro Benchmark Sabbi v8. Es la regla
 * que menos se ve en la especificacion y mas mueve las cifras: por debajo del
 * ticket que fija la macro —500,000 en la v8— la clase inmobiliaria no existe.
 *
 * No es un toggle sino un umbral con escape manual. Se corre despues del solver
 * de pisos y antes de repartir cada clase en instrumentos, igual que en la
 * macro: el objetivo de `inm` se disuelve y su capital se prorratea entre Fijo,
 * Variable y Privados en proporcion a lo que ya tenian. Cash no participa.
 *
 * A donde va ese capital es un campo de la macro y no una constante: cual de
 * las dos reglas es la buena lo decide la mesa mirando la matriz.
 *
 * El escape es el piso: un inmueble que el cliente conserva, o una restriccion
 * del asesor sobre la clase, la clavan y la regla no se aplica. En la macro son
 * la misma cosa — las posiciones conservadas entran como restricciones — y aqui
 * tambien: ambas llegan como piso de la clase. Un ajuste que fija la clase hace
 * lo mismo por la puerta de adelante.
 *
 * Una clase fijada tampoco recibe: si el asesor clavo Renta Fija en 200,000, el
 * capital del inmobiliario disuelto no puede empujarla a 240,000. El prorrateo
 * se reparte entre las que quedan libres.
 */

import { REGLAS_V8 } from '../domain/reglas.js'
import type { ReglaInmobiliario } from '../domain/reglas.js'
import type { ClaseModelo, RepartoClase, ResultadoReparto } from '../domain/tipos.js'

export type { ReglaInmobiliario }

/** Debajo de este ticket, Inmobiliario Directo se disuelve. */
export const UMBRAL_INMOBILIARIO = REGLAS_V8.inmobiliario.umbralUsd

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

/*
 * Las dos reglas reparten el mismo dinero y las dos dejan al cash afuera; lo
 * que cambia es quien lo recibe, y sobre un perfil Moderado la diferencia es
 * de casi siete puntos en Renta Fija. Por eso es un campo de la macro y no una
 * constante: cual de las dos es la buena lo decide la mesa mirando la matriz.
 */

/** Las clases del bloque alternativo, que es quien recibe con `alternativos`. */
const ALTERNATIVAS: ReadonlySet<ClaseModelo> = new Set(['privados', 'club', 'otros'])

/**
 * Los dos mercados publicos, que es quien recibe con `publicos`.
 *
 * Es la regla de la v4 y su argumento es el tamano del ticket: por debajo del
 * umbral, meterle mas dinero a Mercados Privados solo lo deja atrapado en los
 * minimos del Fondo Oportunidad y del club deal, y termina volviendo a
 * publicos por la cascada. Mandarlo directo se ahorra la vuelta.
 */
const PUBLICOS: ReadonlySet<ClaseModelo> = new Set(['fijo', 'variable'])

export interface OpcionesInmobiliario {
  /** Ticket de la propuesta: el patrimonio invertible total. */
  readonly patrimonioTotalUsd: number
  /** Fuerza la conservacion de la clase aunque el ticket no llegue al umbral. */
  readonly inmFijado?: boolean
  /** A donde va el capital disuelto. Por defecto, el reparto de la macro v8. */
  readonly regla?: ReglaInmobiliario
  /** Debajo de este ticket la clase se disuelve. Por defecto, 500,000. */
  readonly umbralUsd?: number
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
  const {
    patrimonioTotalUsd,
    inmFijado = false,
    regla = 'prorratear',
    umbralUsd = UMBRAL_INMOBILIARIO,
  } = opciones

  if (patrimonioTotalUsd >= umbralUsd) return reparto

  const inm = reparto.porClase.find((c) => c.clase === 'inm')
  if (!inm || inm.objetivoUsd <= EPS) return reparto
  if (inmFijado || inm.fijada || inm.pisoUsd > EPS) return reparto

  const receptoras =
    regla === 'alternativos' ? ALTERNATIVAS : regla === 'publicos' ? PUBLICOS : RECEPTORAS
  const recibe = (c: RepartoClase) => receptoras.has(c.clase) && !c.fijada

  let base = reparto.porClase.reduce((acc, c) => (recibe(c) ? acc + c.objetivoUsd : acc), 0)

  // Un perfil sin mercados publicos, o con los dos fijados por el asesor, deja
  // a `publicos` sin a quien darle. Antes que disolver la clase contra nadie y
  // perder el dinero, cae al bloque alternativo, que es lo que hace la macro.
  const conRespaldo =
    regla === 'publicos' && base <= EPS
      ? (c: RepartoClase) => ALTERNATIVAS.has(c.clase) && !c.fijada
      : recibe
  if (conRespaldo !== recibe) {
    base = reparto.porClase.reduce((acc, c) => (conRespaldo(c) ? acc + c.objetivoUsd : acc), 0)
  }
  if (base <= EPS) return reparto

  const factor = (base + inm.objetivoUsd) / base

  const porClase: RepartoClase[] = reparto.porClase.map((c) => {
    if (c.clase === 'inm') {
      return { ...c, objetivoUsd: 0, dineroNuevoUsd: 0, cerrada: true }
    }
    if (!conRespaldo(c)) return c

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
