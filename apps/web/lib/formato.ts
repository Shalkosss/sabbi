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
 * el asesor corrigio se muestra con la precision que escribio, pero pasado por
 * `toFixed`: multiplicar por cien tiene error de coma flotante y sin eso
 * teclear un 29 dejaba la celda mostrando 28.999999999999996. Mientras el
 * campo esta enfocado manda el texto tecleado — ver `CampoNumero` —, asi que
 * redondear aca no le pisa nada a nadie.
 */
export function porcentajeEditable(fraccion: number | null, editado: boolean): string {
  if (fraccion === null) return ''
  const escala = fraccion * 100
  return String(Number(escala.toFixed(editado ? 6 : 2)))
}

/*
 * Formatos de la propuesta.
 *
 * En una tabla densa el simbolo de moneda se repite cuarenta veces y no aporta
 * nada: la cabecera de la columna ya dice USD. Van sin decimales por la misma
 * razon, salvo los controles de cuadre, que se leen al centavo.
 */

const ENTERO = new Intl.NumberFormat('en-US', { maximumFractionDigits: 0 })
const CENTAVOS = new Intl.NumberFormat('en-US', {
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
})
const PORCENTAJE_1 = new Intl.NumberFormat('es-PE', {
  style: 'percent',
  minimumFractionDigits: 1,
  maximumFractionDigits: 1,
})

export const usdTabla = (monto: number): string => ENTERO.format(monto)

export const usdCentavos = (monto: number): string => CENTAVOS.format(monto)

export const pct1 = (fraccion: number): string => PORCENTAJE_1.format(fraccion)

/** Puntos porcentuales con signo: lo que separa el plan del modelo. */
export const puntos = (pp: number): string =>
  `${pp > 0 ? '+' : pp < 0 ? '−' : ''}${Math.abs(pp).toFixed(1)}`

/** Un rango del catalogo. Sin dato no se escribe nada, ni un cero. */
export function rangoPct(rango: { readonly min: number; readonly max: number } | null): string {
  if (rango === null) return '—'
  return rango.min === rango.max ? pct1(rango.min) : `${pct1(rango.min)} a ${pct1(rango.max)}`
}

export function rangoUsd(rango: { readonly min: number; readonly max: number } | null): string {
  if (rango === null) return '—'
  return rango.min === rango.max
    ? usdTabla(rango.min)
    : `${usdTabla(rango.min)} a ${usdTabla(rango.max)}`
}
