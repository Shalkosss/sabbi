import type { Mes, Ventana } from './tipos.js'

/**
 * Las ventanas de la hoja `Distributivos`, en el orden en que se leen.
 *
 * `null` en `meses` es «since inception». No es un numero grande: es una
 * ventana que se estira con la serie, y escribirla como 999 haria que un fondo
 * corto la calculara igual que su 5Y y las dos columnas dijeran lo mismo.
 */
export const VENTANAS: readonly Ventana[] = [
  { clave: '3m', etiqueta: '3M', meses: 3 },
  { clave: '6m', etiqueta: '6M', meses: 6 },
  { clave: '1y', etiqueta: '1 Y', meses: 12 },
  { clave: '2y', etiqueta: '2 Y', meses: 24 },
  { clave: '3y', etiqueta: '3 Y', meses: 36 },
  { clave: '4y', etiqueta: '4 Y', meses: 48 },
  { clave: '5y', etiqueta: '5 Y', meses: 60 },
  { clave: 'si', etiqueta: 'Since inception', meses: null },
]

/**
 * Las ventanas que llevan columna de desviacion y de Sharpe.
 *
 * 3M y 6M quedan afuera, igual que en la hoja. Una desviacion anualizada sobre
 * tres observaciones no es una medida de riesgo, es ruido multiplicado por
 * `sqrt(12)`, y publicarla al lado de las otras invita a compararla.
 */
export const VENTANAS_CON_RIESGO: readonly string[] = ['1y', '2y', '3y', '4y', '5y', 'si']

/** Meses del anio, para la serie de Treasury 10Y que se carga mes a mes. */
export const MESES_DEL_ANIO: readonly string[] = [
  'enero',
  'febrero',
  'marzo',
  'abril',
  'mayo',
  'junio',
  'julio',
  'agosto',
  'septiembre',
  'octubre',
  'noviembre',
  'diciembre',
]

/**
 * A partir de cuantos meses el retorno de una ventana se anualiza.
 *
 * Hasta un anio se informa acumulado: anualizar tres meses proyecta el
 * trimestre a doce y convierte un 2.3% real en un 9.5% que nadie gano. Pasado
 * el anio, sin anualizar no se pueden comparar dos ventanas de largo distinto.
 */
export const MESES_SIN_ANUALIZAR = 12

/** El multiplicador que lleva una desviacion mensual a anual. */
export const FACTOR_ANUALIZACION = Math.sqrt(12)

/**
 * Debajo de esto una desviacion se considera cero y no hay Sharpe.
 *
 * No se puede comparar contra cero pelado: doce meses con el mismo retorno dan
 * una varianza de 1e-19 en vez de 0 — la resta contra la media no cancela
 * exacto en coma flotante — y dividir por eso publicaba un Sharpe de 1.4e16.
 * Cualquier fondo real tiene una desviacion anualizada de centesimas; el mas
 * quieto del libro esta en 0.009. Nueve ordenes de magnitud de margen.
 */
export const DESVIACION_MINIMA = 1e-9

/** `2026-03` → `{ anio: 2026, mes: 3 }`. Devuelve `null` si el texto no es un mes. */
export function partirMes(mes: Mes): { readonly anio: number; readonly mes: number } | null {
  const partes = /^(\d{4})-(\d{2})$/.exec(mes)
  if (partes === null) return null

  const anio = Number(partes[1])
  const numero = Number(partes[2])
  if (numero < 1 || numero > 12) return null

  return { anio, mes: numero }
}

/** `{ anio: 2026, mes: 3 }` → `2026-03`. */
export const armarMes = (anio: number, mes: number): Mes =>
  `${String(anio).padStart(4, '0')}-${String(mes).padStart(2, '0')}`

/**
 * Los meses entre dos extremos, ambos incluidos.
 *
 * La grilla de carga y la tabla de detalle necesitan los meses vacios: un mes
 * sin dato tiene que aparecer como fila para que alguien lo llene. Recorrer
 * solo las observaciones existentes esconde exactamente el hueco que hay que
 * ver.
 */
export function rangoDeMeses(desde: Mes, hasta: Mes): readonly Mes[] {
  const a = partirMes(desde)
  const b = partirMes(hasta)
  if (a === null || b === null) return []

  const meses: Mes[] = []
  let anio = a.anio
  let mes = a.mes

  while (anio < b.anio || (anio === b.anio && mes <= b.mes)) {
    meses.push(armarMes(anio, mes))
    mes += 1
    if (mes > 12) {
      mes = 1
      anio += 1
    }
  }

  return meses
}
