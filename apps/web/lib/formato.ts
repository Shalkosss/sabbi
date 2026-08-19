/** Formateo para pantalla. Nunca redondea el dato, solo cómo se ve. */

const MONEDA = new Intl.NumberFormat('es-PE', {
  style: 'currency',
  currency: 'USD',
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
})

const MONEDA_CORTA = new Intl.NumberFormat('es-PE', {
  style: 'currency',
  currency: 'USD',
  maximumFractionDigits: 0,
})

const PORCENTAJE = new Intl.NumberFormat('es-PE', {
  style: 'percent',
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
})

export const usd = (monto: number): string => MONEDA.format(monto)

export const usdCorto = (monto: number): string => MONEDA_CORTA.format(monto)

export const pct = (fraccion: number | null): string =>
  fraccion === null ? '—' : PORCENTAJE.format(fraccion)

/** Número tal cual para un input: sin separadores, que rompen el parseo. */
export const paraInput = (valor: number | null): string => (valor === null ? '' : String(valor))

/** Lee lo que el asesor tecleó en un input numérico. Vacío es `null`. */
export function desdeInput(texto: string): number | null {
  const limpio = texto.replace(/[^\d.,-]/g, '').replace(',', '.')
  if (limpio.trim() === '') return null
  const numero = Number.parseFloat(limpio)
  return Number.isFinite(numero) ? numero : null
}

/** Plural sin la muleta de "(s)". */
export const plural = (cantidad: number, singular: string, plural: string): string =>
  `${cantidad} ${cantidad === 1 ? singular : plural}`

/**
 * Fraccion a porcentaje editable.
 *
 * Un cap rate calculado sale con quince decimales; en pantalla van dos. Lo que
 * el asesor teclea se respeta tal cual, sin recortarle nada.
 */
export function porcentajeEditable(fraccion: number | null, editado: boolean): string {
  if (fraccion === null) return ''
  const escala = fraccion * 100
  return editado ? String(escala) : String(Number(escala.toFixed(2)))
}
