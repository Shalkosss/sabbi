import { strToU8, zipSync } from 'fflate'
import { describe, expect, it } from 'vitest'

import { celda, leerLibro, refA1 } from '../leer.js'
import { construirLibro } from './construir.js'

describe('leerLibro', () => {
  it('lee hojas, cadenas compartidas y numeros', () => {
    const bytes = construirLibro([
      {
        nombre: 'Ficha Cliente',
        filas: [
          ['Nombres y Apellidos', 'CLIENTE DE PRUEBA'],
          ['Valor', 57971.01449275362],
        ],
      },
    ])

    const libro = leerLibro(bytes)

    expect(libro.hojas).toHaveLength(1)
    expect(libro.hojas[0]?.nombre).toBe('Ficha Cliente')
    expect(celda(libro.hojas[0]!, 0, 1)).toBe('CLIENTE DE PRUEBA')
    expect(celda(libro.hojas[0]!, 1, 1)).toBe(57971.01449275362)
  })

  it('conserva el orden de las hojas del libro', () => {
    const libro = leerLibro(
      construirLibro([
        { nombre: 'Primera', filas: [['a']] },
        { nombre: 'Segunda', filas: [['b']] },
      ]),
    )

    expect(libro.hojas.map((h) => h.nombre)).toEqual(['Primera', 'Segunda'])
  })

  it('respeta filas y columnas dispersas sin correr los valores', () => {
    // La ficha real deja filas vacias entre bloques y arranca en la columna C.
    const libro = leerLibro(
      construirLibro([
        {
          nombre: 'Hoja',
          filas: [[], [], [null, null, 'Inmuebles', null, 'Pais']],
        },
      ]),
    )
    const hoja = libro.hojas[0]!

    expect(celda(hoja, 2, 2)).toBe('Inmuebles')
    expect(celda(hoja, 2, 4)).toBe('Pais')
    expect(celda(hoja, 2, 3)).toBeNull()
    expect(celda(hoja, 0, 0)).toBeNull()
  })

  it('devuelve null fuera de rango en vez de reventar', () => {
    const hoja = leerLibro(construirLibro([{ nombre: 'Hoja', filas: [['a']] }])).hojas[0]!

    expect(celda(hoja, 99, 99)).toBeNull()
    expect(celda(hoja, -1, 0)).toBeNull()
  })

  it('toma el resultado cacheado de una formula, no la formula', () => {
    // La ficha de referencia trae "=464859/3.4" en un valor estimado y
    // "=SUM(M9:M19)" en el total de la tabla de activos.
    const hoja = hojaCruda(
      '<row r="1"><c r="A1"><f>464859/3.4</f><v>136723.23529411765</v></c>' +
        '<c r="B1" t="str"><f>CONCATENATE("Plan"," Patrimonial")</f><v>Plan Patrimonial</v></c></row>',
    )

    expect(celda(hoja, 0, 0)).toBe(136723.23529411765)
    expect(celda(hoja, 0, 1)).toBe('Plan Patrimonial')
  })

  it('lee cadenas en linea y descarta celdas en error', () => {
    // La ficha de referencia trae un #VALUE! heredado de una formula rota.
    const hoja = hojaCruda(
      '<row r="1"><c r="A1" t="inlineStr"><is><t>Uso propio</t></is></c>' +
        '<c r="B1" t="e"><v>#VALUE!</v></c></row>',
    )

    expect(celda(hoja, 0, 0)).toBe('Uso propio')
    expect(celda(hoja, 0, 1)).toBeNull()
  })

  it('junta los tramos de una cadena compartida con formato mixto', () => {
    // Excel parte el texto en <r> cuando una palabra tiene otro formato.
    const hoja = hojaCruda('<row r="1"><c r="A1" t="s"><v>0</v></c></row>', [
      '<si><r><t>Rendimiento anual </t></r><r><t>estimado (%)</t></r></si>',
    ])

    expect(celda(hoja, 0, 0)).toBe('Rendimiento anual estimado (%)')
  })

  it('desescapa las entidades XML del texto', () => {
    const libro = leerLibro(construirLibro([{ nombre: 'Hoja', filas: [['iShares Core S&P 500']] }]))

    expect(celda(libro.hojas[0]!, 0, 0)).toBe('iShares Core S&P 500')
  })

  it('rechaza un archivo que no es un libro de Excel', () => {
    expect(() => leerLibro(zipSync({ 'hola.txt': strToU8('nada') }))).toThrow(/no es un archivo/i)
  })

  it('refA1 traduce coordenadas para los mensajes de error', () => {
    expect(refA1(0, 0)).toBe('A1')
    expect(refA1(8, 2)).toBe('C9')
    expect(refA1(0, 26)).toBe('AA1')
  })
})

/** Arma una hoja suelta a partir del XML crudo de sus filas. */
function hojaCruda(filas: string, entradasSst: readonly string[] = []) {
  const archivos: Record<string, Uint8Array> = {
    '[Content_Types].xml': strToU8('<?xml version="1.0"?><Types/>'),
    'xl/workbook.xml': strToU8(
      '<?xml version="1.0"?><workbook xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><sheets><sheet name="Hoja" sheetId="1" r:id="rId1"/></sheets></workbook>',
    ),
    'xl/_rels/workbook.xml.rels': strToU8(
      '<?xml version="1.0"?><Relationships><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet1.xml"/></Relationships>',
    ),
    'xl/worksheets/sheet1.xml': strToU8(
      `<?xml version="1.0"?><worksheet><sheetData>${filas}</sheetData></worksheet>`,
    ),
  }
  if (entradasSst.length > 0) {
    archivos['xl/sharedStrings.xml'] = strToU8(
      `<?xml version="1.0"?><sst>${entradasSst.join('')}</sst>`,
    )
  }
  return leerLibro(zipSync(archivos)).hojas[0]!
}
