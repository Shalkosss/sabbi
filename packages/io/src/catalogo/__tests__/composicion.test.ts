import { describe, expect, it } from 'vitest'

import { consolidar, leerComposicion, sumaCien } from '../composicion.js'

/**
 * Las composiciones de la hoja real.
 *
 * Cada caso de acá es una celda que existe en la BD de productos. El separador
 * nunca fue el mismo dos veces y ese es exactamente el punto.
 */

describe('leerComposicion', () => {
  it('lee la forma normal, separada por comas', () => {
    expect(leerComposicion('Perú 75%, Emergentes ex-Perú 15%, Latam ex-Perú 10%')).toEqual([
      { nombre: 'Perú', pct: 0.75 },
      { nombre: 'Emergentes ex-Perú', pct: 0.15 },
      { nombre: 'Latam ex-Perú', pct: 0.1 },
    ])
  })

  it('sobrevive a los saltos de línea y a veinte espacios seguidos', () => {
    const crudo =
      'Mercados publicos variable 62.44%                     Mercados publicos fijo 21.78%\nEfectivo 15.06%     Otros 0.72%'

    expect(leerComposicion(crudo).map((p) => p.nombre)).toEqual([
      'Mercados publicos variable',
      'Mercados publicos fijo',
      'Efectivo',
      'Otros',
    ])
  })

  it('no parte un nombre que lleva paréntesis', () => {
    const partes = leerComposicion('Bonos Corporativos Investment Grade (AAA–BBB) 8%, Cash 92%')

    expect(partes[0]).toEqual({
      nombre: 'Bonos Corporativos Investment Grade (AAA–BBB)',
      pct: 0.08,
    })
  })

  it('acepta el porcentaje entre paréntesis y los dos puntos', () => {
    expect(leerComposicion('Club Deals Real Estate Peru (50%) y Bonos Perú: 50%')).toEqual([
      { nombre: 'Club Deals Real Estate Peru', pct: 0.5 },
      { nombre: 'y Bonos Perú', pct: 0.5 },
    ])
  })

  it('devuelve vacío cuando no hay ningún porcentaje', () => {
    expect(leerComposicion('Bonos Perú')).toEqual([])
  })
})

describe('consolidar', () => {
  it('suma las partes que caen en el mismo nombre', () => {
    const juntadas = consolidar([
      { nombre: 'Cash y Otros', pct: 0.1506 },
      { nombre: 'Mercados Privados', pct: 0.6 },
      { nombre: 'Cash y Otros', pct: 0.0072 },
    ])

    expect(juntadas.map((c) => c.nombre)).toEqual(['Mercados Privados', 'Cash y Otros'])
    expect(juntadas[1]?.pct).toBeCloseTo(0.1578, 6)
  })
})

describe('sumaCien', () => {
  it('tolera el redondeo de la planilla', () => {
    expect(sumaCien([{ nombre: 'a', pct: 0.9999 }])).toBe(true)
    expect(sumaCien([{ nombre: 'a', pct: 0.62 }, { nombre: 'b', pct: 0.38 }])).toBe(true)
  })

  it('no tolera que falte o sobre un punto entero', () => {
    expect(sumaCien([{ nombre: 'a', pct: 0.96 }])).toBe(false)
    expect(sumaCien([{ nombre: 'a', pct: 1.031 }])).toBe(false)
  })
})
