/**
 * La marca, en las unidades que entiende un .pptx.
 *
 * Los colores son los mismos tokens que usa la aplicacion — el verde Sabbi, el
 * hueso, el morado — escritos en hexadecimal sin numeral, que es como los pide
 * pptxgenjs. Una sola tabla: un deck que no se parece a la pantalla obliga al
 * asesor a explicar dos veces la misma cifra.
 *
 * La tipografia de marca es Avenir Next Pro y queda pendiente de licencia, por
 * la misma razon que en la plantilla replica: una maquina que no la tenga
 * descuadra el deck entero. Hasta entonces, una generica universal.
 */

export const TIPOGRAFIA_MARCA = 'Avenir Next Pro'
export const TIPOGRAFIA = 'Arial'

export const COLOR = {
  hueso: 'F4F4ED',
  papel: 'FFFFFF',
  verde: '79A82D',
  verdeProfundo: '334F1B',
  verdeNoche: '223311',
  lima: 'C3ED74',
  morado: '7562C6',
  lavanda: 'B5B3FF',

  tinta: '1C2A0E',
  tinta2: '44523A',
  tinta3: '657453',
  tinta4: '8B9679',

  borde: 'E3E1D3',
  pista: 'EDECDF',
  /** Tinta apagada sobre fondo oscuro: la de la pantalla ahi no se lee. */
  tenueSobreOscuro: '93A184',
} as const

/** El color con el que se pinta cada clase. Espeja los chips de la pantalla. */
export const COLOR_CLASE = {
  inm: '3F3585',
  fijo: '41611C',
  variable: '6D9425',
  privados: '584AA0',
  club: '6A5CC0',
  otros: '9A7A2C',
  cash: '7A8770',
} as const

/**
 * Lamina 16:9 en pulgadas, que es la unidad de pptxgenjs.
 *
 * `contenido` es el ancho util entre margenes: casi todo se posiciona contra
 * el, y ninguna medida se escribe dos veces.
 */
export const HOJA = {
  ancho: 10,
  alto: 5.625,
  margen: 0.55,
  contenido: 8.9,
} as const

export const TAMANO = {
  titulo: 26,
  bajada: 12.5,
  seccion: 10,
  cuerpo: 10.5,
  cifra: 20,
  pie: 8.5,
} as const
