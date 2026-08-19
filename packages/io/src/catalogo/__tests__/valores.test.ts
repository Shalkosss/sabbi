import { describe, expect, it } from 'vitest'

import { esAmbiguo, leerBandera, leerRango, leerTexto, leerValor } from '../valores.js'

/**
 * Los cinco formatos que conviven en la columna de rentabilidad.
 *
 * La regla de fondo: si la celda escribe `%`, los números son puntos
 * porcentuales; si no, ya vienen como fracción, que es como Excel guarda una
 * celda con formato de porcentaje.
 */

describe('leerRango', () => {
  it('lee un rango escrito con porcentajes', () => {
    expect(leerRango('3.50% - 4.14%')).toEqual({ min: 0.035, max: 0.0414 })
  })

  it('lee un valor único como un rango de ancho cero', () => {
    expect(leerRango('0.5%')).toEqual({ min: 0.005, max: 0.005 })
  })

  it('respeta una fracción que ya viene sin símbolo', () => {
    expect(leerRango(0.05)).toEqual({ min: 0.05, max: 0.05 })
  })

  it('no confunde un pendiente con un cero', () => {
    expect(leerRango('PENDIENTE')).toBeNull()
    expect(leerRango('')).toBeNull()
    expect(leerRango(null)).toBeNull()
  })

  it('lee el cero como cero', () => {
    expect(leerRango('0')).toEqual({ min: 0, max: 0 })
  })

  it('ordena el rango aunque venga al revés', () => {
    expect(leerRango('9.10% - 7.60%')).toEqual({ min: 0.076, max: 0.091 })
  })
})

describe('leerValor', () => {
  it('toma la menor cuando la celda trae dos productos en uno', () => {
    expect(leerValor('Clase A 1.75% - Clase B 1.05%')).toBeCloseTo(0.0105, 6)
  })

  it('lee la notación científica que deja Excel', () => {
    expect(leerValor(0.0055)).toBeCloseTo(0.0055, 6)
  })
})

describe('esAmbiguo', () => {
  it('marca las celdas con más de una cifra', () => {
    expect(esAmbiguo('Clase A 1.75% - Clase B 1.05%')).toBe(true)
    expect(esAmbiguo('3.25%')).toBe(false)
    expect(esAmbiguo('PENDIENTE')).toBe(false)
  })
})

describe('leerBandera', () => {
  it('acepta las formas afirmativas de la hoja', () => {
    for (const crudo of ['Sí', 'si', 'SI', 'x']) expect(leerBandera(crudo)).toBe(true)
  })

  it('todo lo demás es no', () => {
    for (const crudo of ['no', 'No', '', null]) expect(leerBandera(crudo)).toBe(false)
  })
})

describe('leerTexto', () => {
  it('convierte la celda vacía en null y no en cadena vacía', () => {
    expect(leerTexto('')).toBeNull()
    expect(leerTexto('  ')).toBeNull()
    expect(leerTexto('Credicorp Capital')).toBe('Credicorp Capital')
  })
})
