import { describe, expect, it } from 'vitest'

import type { Benchmark } from '../../domain/tipos.js'
import { CLASES } from '../../domain/tipos.js'
import { PERFIL_DEL_RECORTE, recortarCash } from '../cash.js'

/**
 * El recorte de liquidez del Conservador.
 *
 * Cinco PUNTOS PORCENTUALES del portafolio, no un 5% relativo: es la
 * confusion que la macro deja escrita en un comentario y la que produce un
 * portafolio distinto si se lee mal. 16.4730% tiene que quedar en 11.4730%.
 */

/** Los pesos reales del perfil Conservador, a precision de la hoja. */
const CONSERVADOR: Benchmark = {
  inm: 0.1402254515661956,
  fijo: 0.3898707633416764,
  variable: 0.03020548243437309,
  privados: 0.19655417087642718,
  club: 0.07831421439110636,
  otros: 0.00010001815375620227,
  cash: 0.16472989923646514,
}

const suma = (b: Benchmark) => CLASES.reduce((acc, c) => acc + b[c], 0)

describe('recortarCash', () => {
  it('baja el peso de Cash cinco puntos del portafolio', () => {
    const salida = recortarCash(CONSERVADOR, 'Conservador', 0.05)
    // El numero del comentario de la macro, al cuarto decimal.
    expect(salida.cash * 100).toBeCloseTo(11.473, 3)
  })

  it('no cambia el total: lo que Cash suelta lo reciben las demas', () => {
    const salida = recortarCash(CONSERVADOR, 'Conservador', 0.05)
    expect(suma(salida)).toBeCloseTo(suma(CONSERVADOR), 12)
  })

  it('reparte pro-rata, conservando las proporciones entre las otras clases', () => {
    const salida = recortarCash(CONSERVADOR, 'Conservador', 0.05)
    const razonAntes = CONSERVADOR.fijo / CONSERVADOR.variable
    const razonDespues = salida.fijo / salida.variable
    expect(razonDespues).toBeCloseTo(razonAntes, 12)
  })

  it('cada clase crece, ninguna se achica', () => {
    const salida = recortarCash(CONSERVADOR, 'Conservador', 0.05)
    for (const clase of CLASES) {
      if (clase === 'cash') continue
      expect(salida[clase], clase).toBeGreaterThanOrEqual(CONSERVADOR[clase])
    }
  })

  it('no toca ningun otro perfil', () => {
    for (const perfil of ['Moderado', 'Arriesgado', 'Conservador & Moderado'] as const) {
      expect(recortarCash(CONSERVADOR, perfil, 0.05)).toBe(CONSERVADOR)
    }
    expect(PERFIL_DEL_RECORTE).toBe('Conservador')
  })

  it('con el recorte en cero devuelve el benchmark intacto', () => {
    expect(recortarCash(CONSERVADOR, 'Conservador', 0)).toBe(CONSERVADOR)
  })

  it('nunca saca mas Cash del que hay', () => {
    const pocoCash: Benchmark = { ...CONSERVADOR, cash: 0.01, fijo: 0.5439 }
    const salida = recortarCash(pocoCash, 'Conservador', 0.05)

    expect(salida.cash).toBe(0)
    expect(suma(salida)).toBeCloseTo(suma(pocoCash), 12)
  })

  it('sin Cash no hay nada que recortar', () => {
    const sinCash: Benchmark = { ...CONSERVADOR, cash: 0 }
    expect(recortarCash(sinCash, 'Conservador', 0.05)).toBe(sinCash)
  })

  it('si ninguna otra clase tiene peso, el recorte no se aplica', () => {
    // La liquidez liberada no tendria a donde ir, y evaporarla seria peor.
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
