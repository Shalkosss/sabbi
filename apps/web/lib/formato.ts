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

const MONTO_EDITABLE = new Intl.NumberFormat('en-US', { maximumFractionDigits: 2 })

/**
 * Un monto como se escribe en un campo de dinero: `20,000`.
 *
 * Con separador de miles y sin símbolo — el símbolo va al lado del campo, no
 * adentro, para que nunca entre al parseo. `123250` a secas se lee mal: hay
 * que contar los dígitos para saber si son ciento veintitrés mil o un millón.
 *
 * Solo se muestra cuando el campo no está enfocado; mientras se teclea manda
 * lo tecleado. Ver `CampoNumero`.
 */
export const montoEditable = (valor: number | null): string =>
  valor === null ? '' : MONTO_EDITABLE.format(valor)

/**
 * Lee lo que el asesor tecleó en un campo de dinero.
 *
 * La coma es separador de miles y el punto es el decimal, que es el formato en
 * el que la aplicación muestra todos sus montos. `desdeInput` no sirve acá:
 * convierte la primera coma en punto, así que `20,000` volvía como 20.
 *
 * Un campo vacío es `null` y no cero: son cosas distintas — cero es un monto
 * que el asesor eligió, vacío es uno que todavía no escribió.
 */
export function desdeMonto(texto: string): number | null {
  // Todo lo que no sea digito, punto o signo se va: eso incluye las comas de
  // miles, el simbolo y los espacios.
  const limpio = texto.replace(/[^\d.-]/g, '')
  if (limpio.trim() === '') return null
  const numero = Number.parseFloat(limpio)
  return Number.isFinite(numero) ? numero : null
}

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

/*
 * Formatos de los retornos de fondos.
 *
 * La regla del modulo entero: sin dato se escribe «n/d», nunca un cero y nunca
 * una raya. Un guion se lee como «cero» de reojo en una tabla de cuarenta
 * columnas, y ese es justo el error que hay que evitar — un fondo que todavia
 * no llega a 5Y no es un fondo que rindio 0%.
 */

/** Lo que dice una celda sin dato. Una sola vez, para que no haya dos versiones. */
export const SIN_DATO = 'n/d'

const PORCENTAJE_2 = new Intl.NumberFormat('es-PE', {
  style: 'percent',
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
})

/** Un retorno o una desviacion. Dos decimales, con signo si es negativo. */
export const pctFondo = (fraccion: number | null): string =>
  fraccion === null ? SIN_DATO : PORCENTAJE_2.format(fraccion)

/**
 * Un ratio de Sharpe. Dos decimales y sin unidad.
 *
 * No lleva simbolo de porcentaje aunque el numerador sea un retorno: es un
 * cociente, y verlo con un `%` al lado invita a leer 1.93 como «1.93%».
 */
export const sharpe = (valor: number | null): string =>
  valor === null ? SIN_DATO : valor.toFixed(2)

/** `2026-03` → `mar 2026`. El mes con nombre se distingue del anio de un vistazo. */
export function mesLargo(mes: string | null): string {
  if (mes === null) return SIN_DATO
  const partes = /^(\d{4})-(\d{2})$/.exec(mes)
  if (partes === null) return SIN_DATO

  const nombres = [
    'ene',
    'feb',
    'mar',
    'abr',
    'may',
    'jun',
    'jul',
    'ago',
    'sep',
    'oct',
    'nov',
    'dic',
  ]
  return `${nombres[Number(partes[2]) - 1] ?? '?'} ${partes[1]}`
}

export function rangoUsd(rango: { readonly min: number; readonly max: number } | null): string {
  if (rango === null) return '—'
  return rango.min === rango.max
    ? usdTabla(rango.min)
    : `${usdTabla(rango.min)} a ${usdTabla(rango.max)}`
}
