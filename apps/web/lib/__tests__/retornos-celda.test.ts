import { describe, expect, it } from 'vitest'

import { aCelda, desdeCelda, mismaCifra } from '../retornos-celda'

describe('aCelda', () => {
  it('lleva la fraccion a porcentaje', () => {
    expect(aCelda(0.0083, 'retorno')).toBe('0.83')
    expect(aCelda(-0.0426, 'retorno')).toBe('-4.26')
  })

  it('no arrastra la cola binaria de multiplicar por cien', () => {
    // 0.0083 * 100 es 0.8300000000000001 en coma flotante.
    expect(aCelda(0.0083, 'retorno')).not.toContain('000000')
  })

  it('el NAV va tal cual: es un valor cuota, no un porcentaje', () => {
    expect(aCelda(10.7, 'nav')).toBe('10.7')
  })

  it('vacio es vacio, no cero', () => {
    expect(aCelda(null, 'retorno')).toBe('')
    expect(aCelda(null, 'nav')).toBe('')
  })
})

describe('desdeCelda', () => {
  it('lee el porcentaje como fraccion', () => {
    expect(desdeCelda('0.83', 'retorno')).toBeCloseTo(0.0083, 12)
  })

  it('acepta el signo de porcentaje y la coma decimal del pegado', () => {
    expect(desdeCelda('0.83%', 'retorno')).toBeCloseTo(0.0083, 12)
    expect(desdeCelda('0,83', 'retorno')).toBeCloseTo(0.0083, 12)
    expect(desdeCelda(' 1.20 % ', 'retorno')).toBeCloseTo(0.012, 12)
  })

  it('vacio y un signo suelto son null: todavia no hay numero', () => {
    expect(desdeCelda('', 'retorno')).toBeNull()
    expect(desdeCelda('-', 'retorno')).toBeNull()
  })

  it('cero es un dato, no un vacio', () => {
    expect(desdeCelda('0', 'retorno')).toBe(0)
  })

  it('lo que no es un numero no se adivina', () => {
    expect(desdeCelda('n/d', 'retorno')).toBeNull()
  })

  it('ida y vuelta conserva la cifra', () => {
    for (const fraccion of [0.0083, -0.0426, 0.1, 0]) {
      expect(desdeCelda(aCelda(fraccion, 'retorno'), 'retorno')).toBeCloseTo(fraccion, 12)
    }
  })
})

describe('mismaCifra', () => {
  it('dos nulls son la misma celda vacia', () => {
    expect(mismaCifra(null, null)).toBe(true)
  })

  it('un null contra un numero no lo es', () => {
    expect(mismaCifra(null, 0)).toBe(false)
  })

  it('tolera el ruido de la ida y vuelta por porcentaje', () => {
    expect(mismaCifra(0.0083, desdeCelda('0.83', 'retorno'))).toBe(true)
  })

  it('una diferencia real no se tolera', () => {
    expect(mismaCifra(0.0083, 0.0084)).toBe(false)
  })
})
