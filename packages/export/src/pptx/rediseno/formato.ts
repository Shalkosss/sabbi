import type { Rango, RentabilidadPonderada } from '@sabbi/core'

/**
 * Como se escribe una cifra en el deck.
 *
 * Las mismas reglas que la propuesta en pantalla, y por el mismo motivo: en una
 * lamina el simbolo de moneda repetido cuarenta veces no aporta nada, la
 * cabecera ya dice USD. Lo que no tiene dato no se escribe, ni siquiera un
 * cero: la herramienta no afirma un retorno que el catalogo no sostiene.
 */

const ENTERO = new Intl.NumberFormat('en-US', { maximumFractionDigits: 0 })

const PORCENTAJE_1 = new Intl.NumberFormat('es-PE', {
  style: 'percent',
  minimumFractionDigits: 1,
  maximumFractionDigits: 1,
})

export const usd = (monto: number): string => ENTERO.format(monto)

export const usdConSimbolo = (monto: number): string => `USD ${ENTERO.format(monto)}`

export const pct1 = (fraccion: number): string => PORCENTAJE_1.format(fraccion)

/** Miles redondos para una tabla apretada: 738k, 1.2 MM. */
export function usdCorto(monto: number): string {
  const abs = Math.abs(monto)
  if (abs >= 1_000_000) return `${(monto / 1_000_000).toFixed(monto >= 10_000_000 ? 0 : 1)} MM`
  if (abs >= 1_000) return `${Math.round(monto / 1_000)}k`
  return ENTERO.format(monto)
}

export function rangoPct(rango: Rango | null): string {
  if (rango === null) return '—'
  return rango.min === rango.max ? pct1(rango.min) : `${pct1(rango.min)} a ${pct1(rango.max)}`
}

export function rangoUsd(rango: Rango | null): string {
  if (rango === null) return '—'
  return rango.min === rango.max
    ? usd(rango.min)
    : `${usd(rango.min)} a ${usd(rango.max)}`
}

export const rent = (rentabilidad: RentabilidadPonderada | null): string =>
  rentabilidad === null ? '—' : rangoPct(rentabilidad.rango)

/**
 * El delta de una clase, con flecha y sin color.
 *
 * Subir no es bueno ni bajar es malo: bajar el cash es la mejora y bajar el
 * inmobiliario tambien. La flecha dice la direccion y el numero el tamano;
 * juzgar es del asesor, no de la lamina.
 */
export function delta(pp: number): string {
  if (Math.abs(pp) < 0.05) return 'igual'
  return `${pp > 0 ? '▲' : '▼'} ${Math.abs(pp).toFixed(1)} pp`
}

/**
 * Fecha larga en castellano, en la hora de Lima.
 *
 * La zona va explicita porque el deck se arma en el servidor y el servidor
 * corre en UTC: sin ella, una propuesta generada un martes despues de las
 * siete de la tarde en Lima sale fechada el miercoles.
 */
export function fechaLarga(fecha: Date): string {
  return new Intl.DateTimeFormat('es-PE', {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
    timeZone: 'America/Lima',
  }).format(fecha)
}
