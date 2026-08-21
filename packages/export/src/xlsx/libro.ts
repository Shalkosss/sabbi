/**
 * Escritor de libros .xlsx.
 *
 * El reflejo de `@sabbi/io`, que lee xlsx a mano con la misma libreria de zip
 * y sin ninguna otra. Un .xlsx es un zip con XML adentro, y las partes que un
 * libro necesita para abrir en Excel, en Numbers y en Google Sheets son seis:
 *
 *   [Content_Types].xml        → que tipo es cada parte
 *   _rels/.rels                → donde empieza el libro
 *   xl/workbook.xml            → nombre y orden de las hojas
 *   xl/_rels/workbook.xml.rels → que archivo es cada hoja
 *   xl/styles.xml              → fuentes, rellenos, bordes y formatos de numero
 *   xl/sharedStrings.xml       → tabla de cadenas; las celdas guardan su indice
 *   xl/worksheets/sheetN.xml   → las celdas, cada una con su referencia A1
 *
 * No es un generador de hojas de calculo: no hay formulas, ni graficos, ni
 * validaciones. Escribe valores con formato, que es lo que la propuesta
 * necesita — y lo unico que se puede sostener, porque una formula en el
 * archivo seria una segunda implementacion de una suma que el motor ya hizo.
 *
 * Los estilos se declaran por celda y se deduplican al escribir: dos celdas
 * con el mismo formato comparten una entrada de `cellXfs`. Sin eso un libro de
 * ciento veinte filas declararia doscientos estilos identicos y Excel avisa.
 */

import { strToU8, zipSync } from 'fflate'

/** Lo que puede haber en una celda. `null` es una celda vacia de verdad. */
export type Valor = string | number | null

export interface Formato {
  readonly negrita?: boolean
  readonly cursiva?: boolean
  /** Puntos. Sin esto, 10, que es el cuerpo de la hoja. */
  readonly tamano?: number
  /** Hexadecimal RRGGBB, sin numeral. */
  readonly color?: string
  readonly fondo?: string
  /** Como se escribe el numero. El texto no lo mira. */
  readonly numero?: 'moneda' | 'porcentaje' | 'entero' | 'decimal' | 'puntos' | 'general'
  readonly alineacion?: 'izquierda' | 'derecha' | 'centro'
  readonly bordeAbajo?: boolean
  readonly bordeArriba?: boolean
  /** Parte el texto en varias lineas dentro de la celda. */
  readonly ajustar?: boolean
}

export interface Celda {
  readonly v: Valor
  readonly f?: Formato
}

/** Una celda puede escribirse sin formato: el valor pelado alcanza. */
export type Entrada = Celda | Valor

export interface Hoja {
  /** Hasta 31 caracteres y sin `[]:*?/\`; se recorta y limpia al escribir. */
  readonly nombre: string
  readonly filas: readonly (readonly Entrada[])[]
  /** Ancho de cada columna en caracteres. Las que falten van al ancho por defecto. */
  readonly anchos?: readonly number[]
  /** Rangos combinados en notacion A1: `['A1:H1']`. */
  readonly combinar?: readonly string[]
  /** Celda desde la que empieza el area que se desplaza: `'A4'` congela tres filas. */
  readonly congelar?: string
}

const ESCAPES: Readonly<Record<string, string>> = {
  '&': '&amp;',
  '<': '&lt;',
  '>': '&gt;',
  '"': '&quot;',
  "'": '&apos;',
}

/**
 * Escapa para XML y saca lo que un XML 1.0 no admite.
 *
 * Los nombres de producto llegan de una planilla que paso por varias manos y
 * traen caracteres de control invisibles. Uno solo deja el archivo ilegible
 * para Excel, con un mensaje que no dice cual fue.
 */
export const escapar = (texto: string): string =>
  texto
    // eslint-disable-next-line no-control-regex
    .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/g, '')
    .replace(/[&<>"']/g, (c) => ESCAPES[c] ?? c)

/** `0 → A`, `26 → AA`. Las columnas de Excel cuentan en base 26 sin cero. */
export function columna(indice: number): string {
  let n = indice
  let salida = ''
  do {
    salida = String.fromCharCode(65 + (n % 26)) + salida
    n = Math.floor(n / 26) - 1
  } while (n >= 0)
  return salida
}

/** La referencia A1 de una celda, con fila 1-based. */
export const referencia = (fila: number, col: number): string => `${columna(col)}${fila + 1}`

const esCelda = (entrada: Entrada): entrada is Celda =>
  typeof entrada === 'object' && entrada !== null && 'v' in entrada

/**
 * Los formatos de numero propios.
 *
 * Del 0 al 163 son los que Excel trae de fabrica; los custom empiezan en 164.
 * La moneda va sin simbolo a proposito: la cabecera de la columna ya dice USD
 * y el simbolo repetido ciento veinte veces no agrega nada.
 */
const NUM_FMT: Readonly<Record<NonNullable<Formato['numero']>, number>> = {
  general: 0,
  entero: 164,
  moneda: 165,
  porcentaje: 166,
  decimal: 167,
  puntos: 168,
}

const NUM_FMT_CODIGO: readonly (readonly [number, string])[] = [
  [164, '#,##0'],
  [165, '#,##0.00'],
  [166, '0.0%'],
  [167, '0.00'],
  // Puntos porcentuales, con el signo delante: es una diferencia, y sin el
  // signo un -1.25 y un 1.25 se leen igual de un vistazo.
  [168, '+0.0;-0.0;0.0'],
]

const FUENTE_BASE = 'Calibri'

/**
 * La fecha que llevan las entradas del zip.
 *
 * Fija a proposito: el mismo libro armado dos veces tiene que dar los mismos
 * bytes, y con la del reloj dos corridas identicas difieren — un test de
 * regresion no podria comparar dos archivos.
 *
 * Va en hora local y no en UTC porque asi lo guarda el formato: la marca de
 * tiempo de un zip es la del DOS, sin huso. Se elige el 2 de enero al mediodia
 * para que ninguna zona horaria la corra a 1979, que es anterior a lo que el
 * formato admite. Dos maquinas en husos distintos escriben bytes distintos;
 * la misma maquina, siempre los mismos.
 */
const EPOCA_ZIP = new Date(1980, 0, 2, 12, 0, 0)

interface Registro {
  readonly clave: string
  readonly formato: Formato
}

/** Junta los formatos distintos de todas las hojas y les da un indice. */
function registrar(hojas: readonly Hoja[]): {
  readonly registros: readonly Registro[]
  readonly indiceDe: (formato: Formato | undefined) => number
} {
  const indices = new Map<string, number>()
  const registros: Registro[] = []

  // El indice 0 es el estilo por defecto y siempre existe.
  indices.set('{}', 0)
  registros.push({ clave: '{}', formato: {} })

  for (const hoja of hojas) {
    for (const fila of hoja.filas) {
      for (const entrada of fila) {
        if (!esCelda(entrada) || entrada.f === undefined) continue
        const clave = JSON.stringify(entrada.f, Object.keys(entrada.f).sort())
        if (indices.has(clave)) continue
        indices.set(clave, registros.length)
        registros.push({ clave, formato: entrada.f })
      }
    }
  }

  return {
    registros,
    indiceDe: (formato) => {
      if (formato === undefined) return 0
      return indices.get(JSON.stringify(formato, Object.keys(formato).sort())) ?? 0
    },
  }
}

function estilos(registros: readonly Registro[]): string {
  const fuentes = registros.map(({ formato }) => {
    const partes = [
      `<sz val="${formato.tamano ?? 10}"/>`,
      `<name val="${FUENTE_BASE}"/>`,
      formato.negrita === true ? '<b/>' : '',
      formato.cursiva === true ? '<i/>' : '',
      formato.color === undefined ? '' : `<color rgb="FF${formato.color}"/>`,
    ]
    return `<font>${partes.join('')}</font>`
  })

  // Los dos primeros rellenos son obligatorios y Excel los espera en ese orden.
  const rellenos = [
    '<fill><patternFill patternType="none"/></fill>',
    '<fill><patternFill patternType="gray125"/></fill>',
    ...registros.map(({ formato }) =>
      formato.fondo === undefined
        ? '<fill><patternFill patternType="none"/></fill>'
        : `<fill><patternFill patternType="solid"><fgColor rgb="FF${formato.fondo}"/><bgColor indexed="64"/></patternFill></fill>`,
    ),
  ]

  const bordes = [
    '<border><left/><right/><top/><bottom/><diagonal/></border>',
    ...registros.map(({ formato }) => {
      const arriba = formato.bordeArriba === true ? '<top style="thin"><color rgb="FFBFBFBF"/></top>' : '<top/>'
      const abajo = formato.bordeAbajo === true ? '<bottom style="thin"><color rgb="FFBFBFBF"/></bottom>' : '<bottom/>'
      return `<border><left/><right/>${arriba}${abajo}<diagonal/></border>`
    }),
  ]

  const xfs = registros.map(({ formato }, i) => {
    const numFmtId = NUM_FMT[formato.numero ?? 'general']
    const alineacion =
      formato.alineacion === undefined && formato.ajustar !== true
        ? ''
        : `<alignment${formato.alineacion === undefined ? '' : ` horizontal="${{ izquierda: 'left', derecha: 'right', centro: 'center' }[formato.alineacion]}"`}${formato.ajustar === true ? ' wrapText="1"' : ''} vertical="center"/>`

    return (
      `<xf numFmtId="${numFmtId}" fontId="${i}" fillId="${i + 2}" borderId="${i + 1}" xfId="0"` +
      ` applyFont="1" applyFill="1" applyBorder="1" applyNumberFormat="1"` +
      `${alineacion === '' ? '/>' : ` applyAlignment="1">${alineacion}</xf>`}`
    )
  })

  return (
    `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>` +
    `<styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">` +
    `<numFmts count="${NUM_FMT_CODIGO.length}">` +
    NUM_FMT_CODIGO.map(([id, codigo]) => `<numFmt numFmtId="${id}" formatCode="${escapar(codigo)}"/>`).join('') +
    `</numFmts>` +
    `<fonts count="${fuentes.length}">${fuentes.join('')}</fonts>` +
    `<fills count="${rellenos.length}">${rellenos.join('')}</fills>` +
    `<borders count="${bordes.length}">${bordes.join('')}</borders>` +
    `<cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs>` +
    `<cellXfs count="${xfs.length}">${xfs.join('')}</cellXfs>` +
    `<cellStyles count="1"><cellStyle name="Normal" xfId="0" builtinId="0"/></cellStyles>` +
    `</styleSheet>`
  )
}

/** Nombre de hoja que Excel acepta: sin los seis prohibidos y hasta 31. */
export const nombreDeHoja = (crudo: string): string =>
  (crudo.replace(/[[\]:*?/\\]/g, ' ').trim() || 'Hoja').slice(0, 31)

function hojaXml(
  hoja: Hoja,
  indiceDe: (formato: Formato | undefined) => number,
  cadena: (texto: string) => number,
): string {
  const filas = hoja.filas.map((fila, f) => {
    const celdas = fila
      .map((entrada, c) => {
        const valor = esCelda(entrada) ? entrada.v : entrada
        const estilo = indiceDe(esCelda(entrada) ? entrada.f : undefined)
        const ref = referencia(f, c)

        // Una celda vacia con formato sigue haciendo falta: es la que pinta el
        // fondo de una banda de seccion que no llega a tener texto.
        if (valor === null || valor === '') {
          return estilo === 0 ? '' : `<c r="${ref}" s="${estilo}"/>`
        }
        if (typeof valor === 'number') {
          return Number.isFinite(valor)
            ? `<c r="${ref}" s="${estilo}"><v>${valor}</v></c>`
            : `<c r="${ref}" s="${estilo}"/>`
        }
        return `<c r="${ref}" s="${estilo}" t="s"><v>${cadena(valor)}</v></c>`
      })
      .join('')

    return celdas === '' ? '' : `<row r="${f + 1}">${celdas}</row>`
  })

  const cols =
    hoja.anchos === undefined || hoja.anchos.length === 0
      ? ''
      : `<cols>${hoja.anchos
          .map((ancho, i) => `<col min="${i + 1}" max="${i + 1}" width="${ancho}" customWidth="1"/>`)
          .join('')}</cols>`

  const combinar =
    hoja.combinar === undefined || hoja.combinar.length === 0
      ? ''
      : `<mergeCells count="${hoja.combinar.length}">` +
        hoja.combinar.map((rango) => `<mergeCell ref="${rango}"/>`).join('') +
        `</mergeCells>`

  const panel =
    hoja.congelar === undefined
      ? '<sheetView workbookViewId="0"/>'
      : `<sheetView workbookViewId="0"><pane ySplit="${
          Number.parseInt(hoja.congelar.replace(/^[A-Z]+/, ''), 10) - 1
        }" topLeftCell="${hoja.congelar}" activePane="bottomLeft" state="frozen"/></sheetView>`

  return (
    `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>` +
    `<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">` +
    `<sheetViews>${panel}</sheetViews>` +
    `<sheetFormatPr defaultRowHeight="14.5"/>` +
    cols +
    `<sheetData>${filas.join('')}</sheetData>` +
    combinar +
    `</worksheet>`
  )
}

/**
 * Arma el .xlsx.
 *
 * Devuelve los bytes; no toca el disco. El que lo pide decide si lo manda por
 * HTTP, lo guarda o lo compara contra otro en un test.
 */
export function escribirLibro(hojas: readonly Hoja[]): Uint8Array {
  if (hojas.length === 0) throw new Error('Un libro necesita al menos una hoja.')

  const { registros, indiceDe } = registrar(hojas)

  const cadenas: string[] = []
  const indiceCadena = new Map<string, number>()
  const cadena = (texto: string): number => {
    const yaEsta = indiceCadena.get(texto)
    if (yaEsta !== undefined) return yaEsta
    indiceCadena.set(texto, cadenas.length)
    cadenas.push(texto)
    return cadenas.length - 1
  }

  const paginas = hojas.map((hoja) => hojaXml(hoja, indiceDe, cadena))

  const sst =
    `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>` +
    `<sst xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" count="${cadenas.length}" uniqueCount="${cadenas.length}">` +
    cadenas.map((texto) => `<si><t xml:space="preserve">${escapar(texto)}</t></si>`).join('') +
    `</sst>`

  const workbook =
    `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>` +
    `<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"` +
    ` xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><sheets>` +
    hojas
      .map(
        (hoja, i) =>
          `<sheet name="${escapar(nombreDeHoja(hoja.nombre))}" sheetId="${i + 1}" r:id="rId${i + 1}"/>`,
      )
      .join('') +
    `</sheets></workbook>`

  const rels =
    `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>` +
    `<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">` +
    hojas
      .map(
        (_, i) =>
          `<Relationship Id="rId${i + 1}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet${i + 1}.xml"/>`,
      )
      .join('') +
    `<Relationship Id="rId${hojas.length + 1}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/>` +
    `<Relationship Id="rId${hojas.length + 2}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/sharedStrings" Target="sharedStrings.xml"/>` +
    `</Relationships>`

  const tipos =
    `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>` +
    `<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">` +
    `<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>` +
    `<Default Extension="xml" ContentType="application/xml"/>` +
    `<Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/>` +
    hojas
      .map(
        (_, i) =>
          `<Override PartName="/xl/worksheets/sheet${i + 1}.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>`,
      )
      .join('') +
    `<Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/>` +
    `<Override PartName="/xl/sharedStrings.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sharedStrings+xml"/>` +
    `</Types>`

  const raiz =
    `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>` +
    `<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">` +
    `<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/>` +
    `</Relationships>`

  const archivos: Record<string, Uint8Array> = {
    '[Content_Types].xml': strToU8(tipos),
    '_rels/.rels': strToU8(raiz),
    'xl/workbook.xml': strToU8(workbook),
    'xl/_rels/workbook.xml.rels': strToU8(rels),
    'xl/styles.xml': strToU8(estilos(registros)),
    'xl/sharedStrings.xml': strToU8(sst),
  }
  paginas.forEach((xml, i) => {
    archivos[`xl/worksheets/sheet${i + 1}.xml`] = strToU8(xml)
  })

  return zipSync(archivos, { level: 6, mtime: EPOCA_ZIP })
}
