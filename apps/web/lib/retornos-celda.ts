/**
 * La convencion de una celda de retorno.
 *
 * **En pantalla el retorno va en porcentaje; en la base, en fraccion.** La
 * traduccion vive acá y en ningun otro lado, que es lo unico que impide que
 * tres pantallas del mismo modulo pidan tres cosas distintas por el mismo
 * numero.
 *
 * La decision es a favor de la fuente. El reporte del manager dice 0.83%, la
 * hoja mostraba 0.83% y la primera version de la carga pedia 0.0083. Ese salto
 * es el error mas caro del modulo: un cero de menos convierte un mes normal en
 * un +83% que envenena las treinta metricas del fondo y no se nota hasta que
 * el ranking sale raro. Pidiendo lo mismo que dice el papel, el error no tiene
 * donde ocurrir.
 *
 * El NAV no se convierte: es un valor cuota, no un porcentaje.
 */

/** Que cifra lleva la celda. Son dos series distintas sobre la misma grilla. */
export type CampoCelda = 'retorno' | 'nav'

/**
 * Un retorno mensual de mas de 50% casi siempre es una fraccion tecleada como
 * porcentaje. No se bloquea — el fondo que hizo eso existe — pero se marca.
 */
export const RETORNO_SOSPECHOSO = 0.5

/**
 * La fraccion guardada, como se teclea.
 *
 * El `Number(...toFixed(6))` no redondea el dato: lo despega del ruido binario.
 * `0.0083 * 100` da `0.8300000000000001` en coma flotante, y esa cola aparece
 * adentro del input en cuanto la celda se dibuja.
 */
export const aCelda = (valor: number | null, campo: CampoCelda): string => {
  if (valor === null) return ''
  return campo === 'retorno' ? String(Number((valor * 100).toFixed(6))) : String(valor)
}

/**
 * Lo tecleado, como se guarda.
 *
 * Acepta el `%` y la coma decimal porque los dos llegan al pegar desde Excel.
 * Vacio es `null` y no cero: son cosas distintas — cero es un mes que no rindio
 * nada, vacio es un mes que nadie cargo.
 */
export const desdeCelda = (texto: string, campo: CampoCelda): number | null => {
  const limpio = texto.replace(/%/g, '').replace(/\s/g, '').replace(',', '.')
  if (limpio === '' || limpio === '-') return null

  const numero = Number.parseFloat(limpio)
  if (!Number.isFinite(numero)) return null

  return campo === 'retorno' ? numero / 100 : numero
}

/** Si dos lecturas de la misma celda son el mismo numero. */
export const mismaCifra = (a: number | null, b: number | null): boolean => {
  if (a === null || b === null) return a === b
  return Math.abs(a - b) < 1e-12
}
