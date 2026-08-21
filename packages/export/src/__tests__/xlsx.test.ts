import { leerLibro } from '@sabbi/io'
import { strFromU8, unzipSync } from 'fflate'
import { describe, expect, it } from 'vitest'

import { escribirLibro } from '../xlsx/libro.js'
import { columna, nombreDeHoja, referencia } from '../xlsx/libro.js'
import { armarXlsxPropuesta } from '../xlsx/propuesta.js'
import { propuestaDeEjemplo } from './propuesta-de-ejemplo.js'

/**
 * El libro se comprueba leyendolo.
 *
 * Sabbi ya tiene un lector de xlsx escrito a mano —el que parsea la ficha del
 * cliente— asi que el escritor se valida con el: si el archivo que sale no se
 * puede volver a leer, no es un xlsx, y un test que solo mirara los bytes del
 * zip no lo notaria. Es la misma ida y vuelta que hara Excel al abrirlo.
 */

const OPCIONES = { fecha: new Date('2026-08-21T12:00:00Z'), asesor: 'Vista Previa' }

/** Todo el texto de la hoja, para buscar un rotulo sin depender de la fila. */
const textoDe = (bytes: Uint8Array): string =>
  leerLibro(bytes)
    .hojas[0]!.filas.flatMap((f) => f.map((c) => (typeof c === 'string' ? c : '')))
    .join('\n')

/** Todos los numeros de la hoja. */
const numerosDe = (bytes: Uint8Array): number[] =>
  leerLibro(bytes)
    .hojas[0]!.filas.flatMap((f) => f.filter((c): c is number => typeof c === 'number'))

describe('referencias de celda', () => {
  it('cuenta las columnas en base 26 sin cero', () => {
    expect(columna(0)).toBe('A')
    expect(columna(25)).toBe('Z')
    expect(columna(26)).toBe('AA')
    expect(columna(51)).toBe('AZ')
    expect(columna(52)).toBe('BA')
  })

  it('la fila de una referencia es 1-based', () => {
    expect(referencia(0, 0)).toBe('A1')
    expect(referencia(9, 2)).toBe('C10')
  })
})

describe('nombreDeHoja', () => {
  it('saca los caracteres que Excel no admite', () => {
    expect(nombreDeHoja('360 [Ana]: 1/2')).toBe('360  Ana   1 2')
  })

  it('corta a treinta y uno', () => {
    expect(nombreDeHoja('x'.repeat(60))).toHaveLength(31)
  })

  it('nunca devuelve vacio', () => {
    expect(nombreDeHoja('///')).toBe('Hoja')
  })
})

describe('escribirLibro', () => {
  it('produce un xlsx que el lector de Sabbi vuelve a leer', () => {
    const bytes = escribirLibro([
      { nombre: 'Prueba', filas: [['a', 1], [{ v: 'b', f: { negrita: true } }, 2.5]] },
    ])

    const libro = leerLibro(bytes)
    expect(libro.hojas).toHaveLength(1)
    expect(libro.hojas[0]?.nombre).toBe('Prueba')
    expect(libro.hojas[0]?.filas[0]).toEqual(['a', 1])
    expect(libro.hojas[0]?.filas[1]).toEqual(['b', 2.5])
  })

  it('el mismo libro dos veces da los mismos bytes', () => {
    // Sin esto no hay forma de comparar dos corridas, y un zip con la fecha
    // del reloj adentro cambia en cada llamada.
    const hoja = { nombre: 'Prueba', filas: [['a', 1]] }
    expect(escribirLibro([hoja])).toEqual(escribirLibro([hoja]))
  })

  it('escapa lo que romperia el XML', () => {
    const bytes = escribirLibro([
      { nombre: 'Prueba', filas: [['Renta & <Fija> "A"', 'ó · —']] },
    ])
    expect(leerLibro(bytes).hojas[0]?.filas[0]).toEqual(['Renta & <Fija> "A"', 'ó · —'])
  })

  it('saca los caracteres de control que dejarian el archivo ilegible', () => {
    const sucio = `Fondo\u0007 \u0000Edifica`
    const bytes = escribirLibro([{ nombre: 'Prueba', filas: [[sucio]] }])
    expect(leerLibro(bytes).hojas[0]?.filas[0]?.[0]).toBe('Fondo Edifica')
  })

  it('una celda vacia no ocupa lugar en el resultado', () => {
    const bytes = escribirLibro([{ nombre: 'Prueba', filas: [[null, null, 'c']] }])
    expect(leerLibro(bytes).hojas[0]?.filas[0]).toEqual([null, null, 'c'])
  })

  it('no acepta un libro sin hojas', () => {
    expect(() => escribirLibro([])).toThrow(/al menos una hoja/)
  })
})

describe('el xlsx de la propuesta', () => {
  const bytes = armarXlsxPropuesta(propuestaDeEjemplo(), OPCIONES)

  it('abre y trae una sola hoja, nombrada por el cliente', () => {
    const libro = leerLibro(bytes)
    expect(libro.hojas).toHaveLength(1)
    expect(libro.hojas[0]?.nombre).toContain('360')
  })

  it('trae las siete secciones', () => {
    const texto = textoDe(bytes)
    for (const titulo of [
      '1.  FOTO ACTUAL',
      '2.  INMUEBLE DE USO PROPIO',
      '3.  DISTRIBUCIÓN POR ASSET CLASS',
      '4.  RESUMEN CTA',
      '5.  EXPOSICIÓN ACTUAL',
      '6.  PROPUESTA OBJETIVO',
      '7.  BLOTTER',
    ]) {
      expect(texto, titulo).toContain(titulo)
    }
  })

  it('lleva el nombre y el perfil del cliente en el encabezado', () => {
    const propuesta = propuestaDeEjemplo()
    const texto = textoDe(bytes)
    expect(texto).toContain(propuesta.cliente.nombre)
    expect(texto).toContain(`Perfil: ${propuesta.cliente.perfil}`)
  })

  it('escribe los totales que el motor calculo, no otros', () => {
    const propuesta = propuestaDeEjemplo()
    const numeros = numerosDe(bytes)

    for (const total of [
      propuesta.seccion1.totalUsd,
      propuesta.seccion3.totalUsd,
      propuesta.seccion6.totalUsd,
      propuesta.seccion7.totalComprasUsd,
    ]) {
      expect(numeros.some((v) => Math.abs(v - total) < 0.005), String(total)).toBe(true)
    }
  })

  it('trae cada instrumento del portafolio objetivo', () => {
    const propuesta = propuestaDeEjemplo()
    const texto = textoDe(bytes)

    for (const grupo of propuesta.seccion6.grupos) {
      for (const linea of grupo.lineas) {
        expect(texto, linea.instrumento).toContain(linea.instrumento)
      }
    }
  })

  it('dice si el blotter cuadra, que es lo que decide si se publica', () => {
    expect(textoDe(bytes)).toContain('Compras menos ventas')
    expect(textoDe(bytes)).toMatch(/cuadra/)
  })

  it('no lleva ni una formula: cada cifra es la que el motor calculo', () => {
    // Una celda con `=SUMA(...)` seria una cuenta escrita dos veces, libre de
    // divergir en cuanto alguien inserte una fila. Hay que descomprimir para
    // verlo: sobre el zip, buscar `<f>` no encuentra nada nunca.
    const xml = strFromU8(unzipSync(bytes)['xl/worksheets/sheet1.xml']!)
    expect(xml).not.toContain('<f>')
    expect(xml).toContain('<sheetData>')
  })

  it('deja escrito con que macro se calculo', () => {
    const conMacro = armarXlsxPropuesta(propuestaDeEjemplo(), { ...OPCIONES, versionMacro: 7 })
    expect(textoDe(conMacro)).toContain('macro v7')
    expect(textoDe(bytes)).toContain('macro de fábrica')
  })

  it('el mismo libro dos veces da los mismos bytes', () => {
    expect(armarXlsxPropuesta(propuestaDeEjemplo(), OPCIONES)).toEqual(bytes)
  })
})
