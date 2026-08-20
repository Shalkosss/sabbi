import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'

import { strFromU8, unzipSync } from 'fflate'
import { describe, expect, it } from 'vitest'

import {
  ajustarMarco,
  altoDelMarco,
  altosDe,
  filasDe,
  paginarFilas,
  rehacerTabla,
} from '../pptx/replica/tabla.js'

/**
 * El clonado de filas, contra la tabla de verdad de la lamina 20.
 *
 * Es una tabla de seis columnas con una cabecera, una banda de clase y filas de
 * instrumento. Los tests la rehacen con mas filas de las que trae y comprueban
 * lo unico que se puede afirmar sin abrir PowerPoint: que el XML sigue siendo
 * el mismo documento con otras filas — mismas columnas, mismo formato de
 * celda, marco del alto que corresponde.
 */

const PLANTILLA = unzipSync(
  new Uint8Array(
    readFileSync(fileURLToPath(new URL('../../pptx/replica/template.pptx', import.meta.url))),
  ),
)

const LAMINA_20 = strFromU8(PLANTILLA['ppt/slides/slide20.xml'] ?? new Uint8Array())

/** Cabecera, banda de clase, instrumento: los tres modelos de esta tabla. */
const CABECERA = 0
const BANDA = 1
const INSTRUMENTO = 4

const textos = (xml: string) => [...xml.matchAll(/<a:t>([^<]*)<\/a:t>/g)].map((m) => m[1])

describe('rehacer la tabla de una lamina', () => {
  it('la plantilla trae siete filas y seis columnas', () => {
    expect(filasDe(LAMINA_20)).toHaveLength(7)
    expect(altosDe(LAMINA_20)).toHaveLength(7)
    expect(altosDe(LAMINA_20)[0]).toBe(381000)
  })

  describe('con mas filas de las que la plantilla trae', () => {
    const filas = [
      { modelo: CABECERA, celdas: [null, null, null, null, null, null] },
      { modelo: BANDA, celdas: ['Mercados Públicos — Renta Variable'] },
      ...[1, 2, 3, 4, 5, 6, 7, 8].map((n) => ({
        modelo: INSTRUMENTO,
        celdas: [`Instrumento ${n}`, `Descripción ${n}`, `${n}00,000`, '8.0%', 'Núcleo', 'Flexible'],
      })),
    ]

    const { xml, altoEmu } = rehacerTabla(LAMINA_20, filas)

    it('escribe tantas filas como se le pidan', () => {
      expect(filasDe(xml)).toHaveLength(10)
    })

    it('cada fila conserva sus seis celdas', () => {
      for (const fila of filasDe(xml)) {
        expect(fila.match(/<a:tc[\s>]/g) ?? []).toHaveLength(6)
      }
    })

    it('escribe lo que se le pidio, en su columna', () => {
      const ultima = filasDe(xml).at(-1) ?? ''
      expect(textos(ultima)).toEqual([
        'Instrumento 8',
        'Descripción 8',
        '800,000',
        '8.0%',
        'Núcleo',
        'Flexible',
      ])
    })

    it('conserva el formato de la fila que copio', () => {
      const modelo = filasDe(LAMINA_20)[INSTRUMENTO] ?? ''
      const nueva = filasDe(xml).at(-1) ?? ''
      const formatoDe = (fila: string) => (fila.match(/<a:rPr[^>]*>/g) ?? []).join('')

      expect(formatoDe(nueva)).toBe(formatoDe(modelo))
    })

    it('una celda en null se queda con el texto de la plantilla', () => {
      const cabecera = filasDe(xml)[0] ?? ''
      expect(textos(cabecera)).toContain('Instrumento')
      expect(textos(cabecera)).toContain('Monto')
    })

    it('conserva el ancho de las columnas y el estilo de la tabla', () => {
      const columnas = (fuente: string) => fuente.match(/<a:gridCol w="\d+"/g) ?? []
      expect(columnas(xml)).toEqual(columnas(LAMINA_20))
      expect(xml).toContain('<a:tblPr')
    })

    it('el alto es la suma de los altos de las filas que copio', () => {
      const altos = altosDe(LAMINA_20)
      const esperado =
        (altos[CABECERA] ?? 0) + (altos[BANDA] ?? 0) + (altos[INSTRUMENTO] ?? 0) * 8
      expect(altoEmu).toBe(esperado)
    })

    it('el marco se estira hasta el alto de la tabla', () => {
      const conMarco = ajustarMarco(xml, altoEmu)
      const marco = /<p:graphicFrame>[\s\S]*?<\/p:graphicFrame>/.exec(conMarco)?.[0] ?? ''
      expect(marco).toContain(`cy="${altoEmu}"`)
    })

    it('no deja ni un token de la plantilla suelto en las filas nuevas', () => {
      const nuevas = filasDe(xml).slice(1)
      expect(nuevas.join('')).not.toContain('{{')
    })
  })

  it('escapa lo que escribe: un ampersand rompia el archivo entero', () => {
    const { xml } = rehacerTabla(LAMINA_20, [
      { modelo: INSTRUMENTO, celdas: ['Ferreyros & Cia <SAA>'] },
    ])
    expect(xml).toContain('Ferreyros &amp; Cia &lt;SAA&gt;')
  })

  it('rechaza una fila modelo que la tabla no tiene', () => {
    expect(() => rehacerTabla(LAMINA_20, [{ modelo: 99, celdas: [] }])).toThrow(
      /no tiene la fila modelo 99/,
    )
  })

  it('una lamina sin tabla lo dice en vez de devolverla intacta', () => {
    const sinTabla = strFromU8(PLANTILLA['ppt/slides/slide1.xml'] ?? new Uint8Array())
    expect(() => rehacerTabla(sinTabla, [])).toThrow(/no trae ninguna tabla/)
  })
})

describe('repartir las filas en varias laminas', () => {
  const altos = altosDe(LAMINA_20)
  const CABECERA_FIJA = { modelo: CABECERA, celdas: [null, null, null, null, null, null] }
  const fila = (n: number) => ({ modelo: INSTRUMENTO, celdas: [`Instrumento ${n}`] })

  it('todo en una cuando entra', () => {
    const paginas = paginarFilas([fila(1), fila(2)], altos, {
      altoEmu: altoDelMarco(LAMINA_20),
      fijas: [CABECERA_FIJA],
    })
    expect(paginas).toHaveLength(1)
    expect(paginas[0]).toHaveLength(3)
  })

  it('corta cuando ya no entra, y repite la cabecera', () => {
    const filas = [...Array(20).keys()].map((n) => fila(n + 1))
    const paginas = paginarFilas(filas, altos, {
      altoEmu: altoDelMarco(LAMINA_20),
      fijas: [CABECERA_FIJA],
    })

    expect(paginas.length).toBeGreaterThan(1)
    for (const pagina of paginas) expect(pagina[0]).toBe(CABECERA_FIJA)

    // Ninguna pagina se pasa del alto disponible.
    for (const pagina of paginas) {
      const alto = pagina.reduce((acc, f) => acc + (altos[f.modelo] ?? 0), 0)
      expect(alto).toBeLessThanOrEqual(altoDelMarco(LAMINA_20))
    }

    // Y no se pierde ni se repite ninguna fila de contenido.
    const contenido = paginas.flatMap((p) => p.slice(1))
    expect(contenido).toHaveLength(20)
    expect(new Set(contenido).size).toBe(20)
  })

  it('sin filas devuelve una lamina con la sola cabecera', () => {
    const paginas = paginarFilas([], altos, { altoEmu: 1_000_000, fijas: [CABECERA_FIJA] })
    expect(paginas).toEqual([[CABECERA_FIJA]])
  })
})
