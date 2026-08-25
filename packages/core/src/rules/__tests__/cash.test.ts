import { describe, expect, it } from 'vitest'

import type { Benchmark } from '../../domain/tipos.js'
import { CLASES } from '../../domain/tipos.js'
import { recortarCash } from '../cash.js'

/**
 * El recorte de liquidez del conservador.
 *
 * Lo que hay que fijar es lo que en la hoja se confundia: son PUNTOS del
 * portafolio y no una parte del cash. Cinco puntos sobre un 16.47% dan 11.47%
 * y no 15.65%, y la diferencia sobre un ticket grande son miles de dolares.
 */

const BENCHMARK: Benchmark = {
  inm: 0.1,
  fijo: 0.3,
  variable: 0.2,
  privados: 0.15,
  club: 0.05,
  otros: 0.0353,
  cash: 0.1647,
}

const suma = (b: Benchmark) => CLASES.reduce((acc, c) => acc + b[c], 0)

describe('recortarCash', () => {
  it('le saca puntos del portafolio, no una parte del cash', () => {
    const r = recortarCash(BENCHMARK, 'Conservador', 0.05)

    // 0.1647 - 0.05 * 1.0 = 0.1147, no 0.1647 * 0.95 = 0.1565.
    expect(r.cash).toBeCloseTo(0.1147, 6)
  })

  it('conserva la suma: lo que sale del cash entra en las demas', () => {
    const r = recortarCash(BENCHMARK, 'Conservador', 0.05)

    expect(suma(r)).toBeCloseTo(suma(BENCHMARK), 9)
  })

  it('reparte los puntos segun el peso de cada clase', () => {
    const r = recortarCash(BENCHMARK, 'Conservador', 0.05)

    const base = suma(BENCHMARK) - BENCHMARK.cash
    for (const clase of CLASES) {
      if (clase === 'cash') continue
      expect(r[clase]).toBeCloseTo(BENCHMARK[clase] + 0.05 * (BENCHMARK[clase] / base), 9)
    }
  })

  it('mantiene el orden relativo: la que mas pesaba sigue pesando mas', () => {
    const r = recortarCash(BENCHMARK, 'Conservador', 0.05)

    expect(r.fijo).toBeGreaterThan(r.variable)
    expect(r.variable).toBeGreaterThan(r.privados)
  })

  it('no toca los otros cuatro perfiles', () => {
    for (const perfil of ['Conservador & Moderado', 'Moderado', 'Arriesgado'] as const) {
      expect(recortarCash(BENCHMARK, perfil, 0.05)).toBe(BENCHMARK)
    }
  })

  it('en cero devuelve el mismo objeto, sin ruido de coma flotante', () => {
    expect(recortarCash(BENCHMARK, 'Conservador', 0)).toBe(BENCHMARK)
  })

  it('no deja el cash en negativo si los puntos pasan lo que hay', () => {
    // Treinta puntos sobre un cash de 16.47 no es un cash de -13.53.
    const r = recortarCash(BENCHMARK, 'Conservador', 0.3)

    expect(r.cash).toBe(0)
    expect(suma(r)).toBeCloseTo(suma(BENCHMARK), 9)
  })

  it('no hace nada si el perfil no trae cash', () => {
    const sinCash = { ...BENCHMARK, cash: 0 }

    expect(recortarCash(sinCash, 'Conservador', 0.05)).toBe(sinCash)
  })

  it('no hace nada si no hay ninguna clase que pueda recibir', () => {
    const soloCash: Benchmark = {
      inm: 0,
      fijo: 0,
      variable: 0,
      privados: 0,
      club: 0,
      otros: 0,
      cash: 1,
    }

    expect(recortarCash(soloCash, 'Conservador', 0.05)).toBe(soloCash)
  })
})
