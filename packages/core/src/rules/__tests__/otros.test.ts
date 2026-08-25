import { describe, expect, it } from 'vitest'

import { otrosAbre, OTROS_BTC, OTROS_ORO, repartirOtros } from '../otros.js'

/**
 * La clase Otros.
 *
 * En la v4 el umbral no es un numero propio sino el mismo ticket minimo que
 * decide si un ETF es ejecutable: es la misma pregunta — «este monto se puede
 * colocar» — y tenerla escrita dos veces era como se separaban.
 */

const PESOS = { [OTROS_BTC]: 0.84, [OTROS_ORO]: 0.16 }

describe('otrosAbre', () => {
  it('abre desde el ticket minimo', () => {
    expect(otrosAbre(20_000, 20_000)).toBe(true)
    expect(otrosAbre(19_000, 20_000)).toBe(false)
  })

  it('un centavo de diferencia no decide nada', () => {
    expect(otrosAbre(19_999.995, 20_000)).toBe(true)
  })

  it('sin monto no abre', () => {
    expect(otrosAbre(0, 20_000)).toBe(false)
  })

  it('sigue al ticket que se le pase', () => {
    expect(otrosAbre(12_000, 10_000)).toBe(true)
    expect(otrosAbre(12_000, 50_000)).toBe(false)
  })
})

describe('repartirOtros', () => {
  it('sin monto no abre lineas', () => {
    expect(repartirOtros(0, PESOS)).toEqual([])
  })

  it('reparte por peso y cierra contra el monto', () => {
    const lineas = repartirOtros(50_000, PESOS)

    expect(lineas.map((l) => l.instrumento)).toEqual([OTROS_BTC, OTROS_ORO])
    expect(lineas[0]?.usd).toBeCloseTo(42_000, 6)
    expect(lineas[1]?.usd).toBeCloseTo(8_000, 6)
    expect(lineas.reduce((acc, l) => acc + l.usd, 0)).toBeCloseTo(50_000, 6)
  })

  it('renormaliza pesos que no suman uno', () => {
    const lineas = repartirOtros(50_000, { [OTROS_BTC]: 0.0046, [OTROS_ORO]: 0.000925 })
    expect(lineas.reduce((acc, l) => acc + l.usd, 0)).toBeCloseTo(50_000, 6)
  })

  it('sin pesos, todo a BTC', () => {
    expect(repartirOtros(30_000, {})).toEqual([{ instrumento: OTROS_BTC, usd: 30_000 }])
  })

  it('sale ordenado de mayor a menor', () => {
    const lineas = repartirOtros(50_000, { [OTROS_ORO]: 0.9, [OTROS_BTC]: 0.1 })
    expect(lineas[0]?.instrumento).toBe(OTROS_ORO)
  })
})
