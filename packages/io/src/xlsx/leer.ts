/**
 * Lector de libros .xlsx.
 *
 * Solo extrae valores: no interpreta formatos, ni estilos, ni formulas. Es lo
 * unico que la ficha patrimonial necesita, y mantenerlo asi deja el arbol de
 * dependencias en una sola libreria de descompresion sin dependencias propias.
 *
 * Un .xlsx es un zip con XML adentro. La ruta que interesa:
 *
 *   [Content_Types].xml
 *   xl/workbook.xml            → nombre y orden de las hojas
 *   xl/_rels/workbook.xml.rels → que archivo es cada hoja
 *   xl/sharedStrings.xml       → tabla de cadenas; las celdas guardan su indice
 *   xl/worksheets/sheetN.xml   → las celdas, cada una con su referencia A1
 *
 * Las celdas se ubican por su atributo `r`, no por su posicion en el XML, asi
 * que las filas y columnas vacias no corren nada.
 */

import { strFromU8, unzipSync } from 'fflate'

/** Valor de una celda ya normalizado. Una celda vacia o en error es `null`. */
export type Celda = string | number | boolean | null

export interface Hoja {
  readonly nombre: string
  /** Filas 0-based. Cada fila llega hasta su ultima celda con valor. */
  readonly filas: readonly (readonly Celda[])[]
}

export interface Libro {
  readonly hojas: readonly Hoja[]
}

const RE_CELDA = /<c\b([^>]*?)(?:\/>|>([\s\S]*?)<\/c>)/g
const RE_SI = /<si\b[^>]*>([\s\S]*?)<\/si>/g
const RE_T = /<t\b[^>]*>([\s\S]*?)<\/t>/g
const RE_HOJA = /<sheet\b([^>]*?)\/?>/g
const RE_REL = /<Relationship\b([^>]*?)\/?>/g

const RE_ATRIBUTO = /([\w:.-]+)\s*=\s*"([^"]*)"/g

/** Atributos de una etiqueta, en un solo barrido y sin regex dinamicas. */
const atributos = (etiqueta: string): ReadonlyMap<string, string> => {
  const pares = new Map<string, string>()
  for (const par of etiqueta.matchAll(RE_ATRIBUTO)) {
    const nombre = par[1]
    if (nombre !== undefined && !pares.has(nombre)) pares.set(nombre, par[2] ?? '')
  }
  return pares
}

const ENTIDADES: Readonly<Record<string, string>> = {
  amp: '&',
  lt: '<',
  gt: '>',
  quot: '"',
  apos: "'",
}

const desescapar = (texto: string): string =>
  texto.replace(/&(#x?[0-9a-fA-F]+|[a-zA-Z]+);/g, (completo, cuerpo: string) => {
    if (cuerpo.startsWith('#x') || cuerpo.startsWith('#X')) {
      return String.fromCodePoint(Number.parseInt(cuerpo.slice(2), 16))
    }
    if (cuerpo.startsWith('#')) return String.fromCodePoint(Number.parseInt(cuerpo.slice(1), 10))
    return ENTIDADES[cuerpo] ?? completo
  })

/** Concatena los tramos `<t>` de un bloque: Excel parte el texto por formato. */
const textoDeTramos = (xml: string): string => {
  let unido = ''
  for (const tramo of xml.matchAll(RE_T)) unido += tramo[1] ?? ''
  return desescapar(unido)
}

/** "C9" → { fila: 8, col: 2 }. Devuelve null si la referencia no es utilizable. */
const coordenadas = (ref: string): { fila: number; col: number } | null => {
  const partes = /^([A-Z]+)(\d+)$/.exec(ref)
  if (partes === null) return null
  const letras = partes[1] ?? ''
  const numero = partes[2] ?? ''
  let col = 0
  for (const letra of letras) col = col * 26 + (letra.charCodeAt(0) - 64)
  return { fila: Number.parseInt(numero, 10) - 1, col: col - 1 }
}

/** Inverso de `coordenadas`, para mensajes de error legibles. */
export function refA1(fila: number, col: number): string {
  let resto = col
  let letras = ''
  do {
    letras = String.fromCharCode(65 + (resto % 26)) + letras
    resto = Math.floor(resto / 26) - 1
  } while (resto >= 0)
  return `${letras}${fila + 1}`
}

/** Lectura segura: fuera de rango es `null`, no una excepcion. */
export function celda(hoja: Hoja, fila: number, col: number): Celda {
  return hoja.filas[fila]?.[col] ?? null
}

const valorCelda = (
  atributosCelda: ReadonlyMap<string, string>,
  contenido: string,
  compartidas: readonly string[],
): Celda => {
  const tipo = atributosCelda.get('t') ?? 'n'
  if (tipo === 'e') return null
  if (tipo === 'inlineStr') return textoDeTramos(contenido) || null

  const crudo = /<v\b[^>]*>([\s\S]*?)<\/v>/.exec(contenido)?.[1]
  if (crudo === undefined) return null

  if (tipo === 's') {
    const indice = Number.parseInt(crudo, 10)
    return compartidas[indice] ?? null
  }
  if (tipo === 'str') return desescapar(crudo) || null
  if (tipo === 'b') return crudo === '1'

  const numero = Number.parseFloat(crudo)
  return Number.isNaN(numero) ? null : numero
}

const leerHoja = (nombre: string, xml: string, compartidas: readonly string[]): Hoja => {
  const filas: Celda[][] = []
  for (const encontrada of xml.matchAll(RE_CELDA)) {
    const atributosCelda = atributos(encontrada[1] ?? '')
    const ref = atributosCelda.get('r')
    if (ref === undefined) continue
    const punto = coordenadas(ref)
    if (punto === null) continue

    const valor = valorCelda(atributosCelda, encontrada[2] ?? '', compartidas)
    if (valor === null) continue

    const fila = (filas[punto.fila] ??= [])
    while (fila.length < punto.col) fila.push(null)
    fila[punto.col] = valor
  }

  // Las filas sin ninguna celda quedan como huecos del array; densificarlas
  // evita que quien recorra la hoja tenga que distinguir hueco de fila vacia.
  const densas = Array.from({ length: filas.length }, (_, i) => filas[i] ?? [])
  return { nombre, filas: densas }
}

const rutaHoja = (objetivo: string): string =>
  objetivo.startsWith('/') ? objetivo.slice(1) : `xl/${objetivo}`

export function leerLibro(datos: Uint8Array): Libro {
  const paquete = unzipSync(datos)
  const texto = (ruta: string): string | null => {
    const bytes = paquete[ruta]
    return bytes === undefined ? null : strFromU8(bytes)
  }

  const workbook = texto('xl/workbook.xml')
  if (workbook === null) {
    throw new Error('El archivo no es un archivo .xlsx válido: falta xl/workbook.xml.')
  }

  const compartidas: string[] = []
  const sst = texto('xl/sharedStrings.xml')
  if (sst !== null) {
    for (const entrada of sst.matchAll(RE_SI)) compartidas.push(textoDeTramos(entrada[1] ?? ''))
  }

  const destinos = new Map<string, string>()
  const rels = texto('xl/_rels/workbook.xml.rels')
  if (rels !== null) {
    for (const rel of rels.matchAll(RE_REL)) {
      const propios = atributos(rel[1] ?? '')
      const id = propios.get('Id')
      const objetivo = propios.get('Target')
      if (id !== undefined && objetivo !== undefined) destinos.set(id, rutaHoja(objetivo))
    }
  }

  const hojas: Hoja[] = []
  let orden = 0
  for (const declarada of workbook.matchAll(RE_HOJA)) {
    orden += 1
    const propios = atributos(declarada[1] ?? '')
    const nombre = desescapar(propios.get('name') ?? `Hoja${orden}`)
    const id = propios.get('r:id') ?? propios.get('id')
    const ruta = (id === undefined ? undefined : destinos.get(id)) ?? `xl/worksheets/sheet${orden}.xml`
    const xml = texto(ruta)
    if (xml === null) continue
    hojas.push(leerHoja(nombre, xml, compartidas))
  }

  if (hojas.length === 0) {
    throw new Error('El archivo no es un archivo .xlsx válido: no tiene hojas legibles.')
  }

  return { hojas }
}
