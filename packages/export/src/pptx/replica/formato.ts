/**
 * Formateo para el deck.
 *
 * No son las mismas reglas que las de pantalla. El deck que Sabbi ya venia
 * entregando escribe los montos en formato corto y sin decimales — `$12,345`,
 * `$80k` — porque una lamina proyectada se lee de lejos, y un centavo ahi no
 * informa nada. Estos formatos salen de medir el deck original, no de una
 * preferencia: el objetivo es que la version generada sea indistinguible de la
 * que se hacia a mano.
 */

const MONTO = new Intl.NumberFormat('en-US', {
  style: 'currency',
  currency: 'USD',
  maximumFractionDigits: 0,
})

/** `$12,345`. El separador de miles es la coma, como en el deck original. */
export const monto = (usd: number): string => MONTO.format(usd)

/**
 * `$80k`, `$1.2MM`. Para etiquetas de barra, donde el ancho manda.
 *
 * Por debajo de mil no se abrevia: `$840` ya es corto, y `$0.8k` se lee peor.
 */
export function montoCorto(usd: number): string {
  const signo = usd < 0 ? '-' : ''
  const abs = Math.abs(usd)

  if (abs >= 1_000_000) {
    const millones = abs / 1_000_000
    return `${signo}$${millones.toFixed(millones >= 10 ? 0 : 1)}MM`
  }
  if (abs >= 1_000) return `${signo}$${Math.round(abs / 1_000)}k`
  return `${signo}$${Math.round(abs)}`
}

/** `12%`, `12.5%`. La fraccion entra como 0.125, no como 12.5. */
export function pct(fraccion: number | null, decimales = 0): string {
  if (fraccion === null) return '—'
  return `${(fraccion * 100).toFixed(decimales)}%`
}

/** `4.5–6.0%`. Con guion largo, que es el que usa la plantilla. */
export function rangoPct(
  min: number | null,
  max: number | null,
  decimales = 1,
): string {
  if (min === null || max === null) return '—'
  if (min === max) return pct(min, decimales)
  return `${(min * 100).toFixed(decimales)}–${(max * 100).toFixed(decimales)}%`
}

/** `$120,000 → $180,000`. La flecha es la del deck original. */
export const transicion = (antes: string, despues: string): string => `${antes} → ${despues}`

/**
 * `31/12/2026`. Se recibe la fecha; este paquete no mira el reloj.
 *
 * La zona va explicita porque el deck se arma en el servidor y el servidor
 * corre en UTC: sin ella, una propuesta emitida un martes despues de las siete
 * de la tarde en Lima sale fechada el miercoles.
 */
export function fecha(cuando: Date): string {
  return new Intl.DateTimeFormat('es-PE', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    timeZone: 'America/Lima',
  }).format(cuando)
}
