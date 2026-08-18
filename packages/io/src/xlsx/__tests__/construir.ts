/**
 * Constructor de libros .xlsx minimos para los tests.
 *
 * Las fichas reales traen datos de clientes y no viven en el repositorio, asi
 * que los tests arman su propio paquete OOXML en memoria. Es suficiente para
 * ejercitar el lector: cadenas compartidas, numeros, filas dispersas y hojas
 * multiples, que es lo que produce Excel al guardar una ficha.
 */

import { strToU8, zipSync } from 'fflate'

export type ValorCelda = string | number | null

export interface HojaFuente {
  readonly nombre: string
  readonly filas: readonly (readonly ValorCelda[])[]
}

const escapar = (texto: string): string =>
  texto
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')

/** Indice de columna 0-based a letras: 0 → A, 26 → AA. */
export const letraColumna = (col: number): string => {
  let resto = col
  let letras = ''
  do {
    letras = String.fromCharCode(65 + (resto % 26)) + letras
    resto = Math.floor(resto / 26) - 1
  } while (resto >= 0)
  return letras
}

const xmlHoja = (hoja: HojaFuente, compartidas: string[]): string => {
  const filas = hoja.filas
    .map((celdas, i) => {
      const cuerpo = celdas
        .map((valor, j) => {
          if (valor === null || valor === '') return ''
          const ref = `${letraColumna(j)}${i + 1}`
          if (typeof valor === 'number') return `<c r="${ref}"><v>${valor}</v></c>`
          let indice = compartidas.indexOf(valor)
          if (indice === -1) indice = compartidas.push(valor) - 1
          return `<c r="${ref}" t="s"><v>${indice}</v></c>`
        })
        .join('')
      return cuerpo === '' ? '' : `<row r="${i + 1}">${cuerpo}</row>`
    })
    .join('')
  return `<?xml version="1.0" encoding="UTF-8"?><worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><sheetData>${filas}</sheetData></worksheet>`
}

/** Arma un .xlsx valido con las hojas dadas y lo devuelve como bytes. */
export function construirLibro(hojas: readonly HojaFuente[]): Uint8Array {
  const compartidas: string[] = []
  const archivos: Record<string, Uint8Array> = {}

  hojas.forEach((hoja, i) => {
    archivos[`xl/worksheets/sheet${i + 1}.xml`] = strToU8(xmlHoja(hoja, compartidas))
  })

  const entradasSst = compartidas.map((texto) => `<si><t>${escapar(texto)}</t></si>`).join('')
  archivos['xl/sharedStrings.xml'] = strToU8(
    `<?xml version="1.0" encoding="UTF-8"?><sst xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" count="${compartidas.length}" uniqueCount="${compartidas.length}">${entradasSst}</sst>`,
  )

  const refsHojas = hojas
    .map((hoja, i) => `<sheet name="${escapar(hoja.nombre)}" sheetId="${i + 1}" r:id="rId${i + 1}"/>`)
    .join('')
  archivos['xl/workbook.xml'] = strToU8(
    `<?xml version="1.0" encoding="UTF-8"?><workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><sheets>${refsHojas}</sheets></workbook>`,
  )

  const rels = hojas
    .map(
      (_, i) =>
        `<Relationship Id="rId${i + 1}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet${i + 1}.xml"/>`,
    )
    .join('')
  archivos['xl/_rels/workbook.xml.rels'] = strToU8(
    `<?xml version="1.0" encoding="UTF-8"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">${rels}<Relationship Id="rIdSst" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/sharedStrings" Target="sharedStrings.xml"/></Relationships>`,
  )

  archivos['_rels/.rels'] = strToU8(
    `<?xml version="1.0" encoding="UTF-8"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/></Relationships>`,
  )

  archivos['[Content_Types].xml'] = strToU8(
    `<?xml version="1.0" encoding="UTF-8"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="xml" ContentType="application/xml"/></Types>`,
  )

  return zipSync(archivos)
}
