/**
 * Normalizacion de texto para localizar anclas y clasificar posiciones.
 *
 * Las fichas se editan a mano: llegan con tildes inconsistentes, mayusculas
 * mezcladas, dobles espacios y saltos de linea dentro de la celda. Todo lo que
 * compare texto de una ficha compara la forma normalizada, nunca la cruda.
 */

/** Marcas diacriticas que NFD separa de su letra base. */
const DIACRITICOS = /[̀-ͯ]/g

/** Minusculas, sin tildes, sin dobles espacios y sin bordes. */
export function normalizar(texto: string): string {
  return texto.normalize('NFD').replace(DIACRITICOS, '').toLowerCase().replace(/\s+/g, ' ').trim()
}

/** `true` si el texto contiene la frase, ambos normalizados. */
export function contiene(texto: string, frase: string): boolean {
  return normalizar(texto).includes(normalizar(frase))
}

/** `true` si el texto es la frase, ambos normalizados. */
export function equivale(texto: string, frase: string): boolean {
  return normalizar(texto) === normalizar(frase)
}
