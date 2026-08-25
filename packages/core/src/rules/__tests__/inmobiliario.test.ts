import { describe, expect, it } from 'vitest'

import type { Benchmark } from '../../domain/tipos.js'
import { CLASES } from '../../domain/tipos.js'
import { resolverInmobiliario } from '../inmobiliario.js'

/**
 * El umbral del inmobiliario.
 *
 * La regla tiene dos salidas y el ticket decide cual. Es la que mas mueve las
 * cifras y la que menos se ve, asi que cada caso comprueba tambien que el
 * dinero no se cree ni se pierda: el total del benchmark no cambia nunca.
 */

const BENCHMARK: Benchmark = {
  inm: 0.24,
  fijo: 0.19,
  variable: 0.16,
  privados: 0.21,
  club: 0.09,
  otros: 0.02,
  cash: 0.09,
}

const suma = (b: Benchmark) => CLASES.reduce((acc, c) => acc + b[c], 0)

const correr = (patrimonioTotalUsd: number, extra: Record<string, unknown> = {}) =>
  resolverInmobiliario(BENCHMARK, {
    patrimonioTotalUsd,
    accede: false,
    tienePiso: false,
    umbralUsd: 100_000,
    ...extra,
  })

describe('resolverInmobiliario', () => {
  it('con ticket chico reparte entre Renta Fija y Variable', () => {
    const salida = correr(80_000)

    expect(salida.disuelta).toBe(true)
    expect(salida.destino).toBe('publicos')
    expect(salida.benchmark.inm).toBe(0)
    expect(salida.benchmark.fijo).toBeGreaterThan(BENCHMARK.fijo)
    expect(salida.benchmark.variable).toBeGreaterThan(BENCHMARK.variable)
    // Privados y Cash no participan.
    expect(salida.benchmark.privados).toBe(BENCHMARK.privados)
    expect(salida.benchmark.cash).toBe(BENCHMARK.cash)
  })

  it('con ticket grande reparte entre Privados y Club Deals', () => {
    const salida = correr(500_000)

    expect(salida.disuelta).toBe(true)
    expect(salida.destino).toBe('privados')
    expect(salida.benchmark.inm).toBe(0)
    expect(salida.benchmark.privados).toBeGreaterThan(BENCHMARK.privados)
    expect(salida.benchmark.club).toBeGreaterThan(BENCHMARK.club)
    expect(salida.benchmark.fijo).toBe(BENCHMARK.fijo)
    expect(salida.benchmark.cash).toBe(BENCHMARK.cash)
  })

  it('el umbral es inclusivo: justo en el umbral va a publicos', () => {
    expect(correr(100_000).destino).toBe('publicos')
    expect(correr(100_000.01).destino).toBe('privados')
  })

  it('reparte a prorrata del peso de cada receptora', () => {
    const salida = correr(80_000)
    const razonAntes = BENCHMARK.fijo / BENCHMARK.variable
    const razonDespues = salida.benchmark.fijo / salida.benchmark.variable
    expect(razonDespues).toBeCloseTo(razonAntes, 12)
  })

  it('no crea ni pierde peso, en las dos direcciones', () => {
    for (const ticket of [80_000, 500_000]) {
      expect(suma(correr(ticket).benchmark), String(ticket)).toBeCloseTo(suma(BENCHMARK), 12)
    }
  })

  it('si el cliente accede, la clase se queda sin importar el ticket', () => {
    for (const ticket of [10_000, 80_000, 5_000_000]) {
      const salida = correr(ticket, { accede: true })
      expect(salida.disuelta, String(ticket)).toBe(false)
      expect(salida.benchmark).toBe(BENCHMARK)
    }
  })

  it('un inmueble conservado la salva igual que acceder', () => {
    const salida = correr(80_000, { tienePiso: true })
    expect(salida.disuelta).toBe(false)
    expect(salida.benchmark).toBe(BENCHMARK)
  })

  it('sin peso inmobiliario no hay nada que repartir', () => {
    const sinInm: Benchmark = { ...BENCHMARK, inm: 0, fijo: 0.43 }
    const salida = resolverInmobiliario(sinInm, {
      patrimonioTotalUsd: 80_000,
      accede: false,
      tienePiso: false,
      umbralUsd: 100_000,
    })
    expect(salida.disuelta).toBe(false)
    expect(salida.benchmark).toBe(sinInm)
  })

  it('sin mercados publicos y ticket chico, cae al bloque privado', () => {
    // Un perfil sin Fijo ni Variable no tiene el destino que le tocaria; el
    // dinero va al unico bloque que puede recibirlo antes que perderse.
    const sinPublicos: Benchmark = { ...BENCHMARK, fijo: 0, variable: 0, privados: 0.56 }
    const salida = resolverInmobiliario(sinPublicos, {
      patrimonioTotalUsd: 80_000,
      accede: false,
      tienePiso: false,
      umbralUsd: 100_000,
    })

    expect(salida.disuelta).toBe(true)
    expect(salida.destino).toBe('privados')
    expect(suma(salida.benchmark)).toBeCloseTo(suma(sinPublicos), 12)
  })

  it('sin ningun destino posible, la clase se queda', () => {
    // Mejor un inmobiliario que el cliente no toma que dinero evaporado.
    const soloInmYCash: Benchmark = {
      inm: 0.5,
      fijo: 0,
      variable: 0,
      privados: 0,
      club: 0,
      otros: 0,
      cash: 0.5,
    }
    const salida = resolverInmobiliario(soloInmYCash, {
      patrimonioTotalUsd: 80_000,
      accede: false,
      tienePiso: false,
      umbralUsd: 100_000,
    })
    expect(salida.disuelta).toBe(false)
    expect(salida.benchmark).toBe(soloInmYCash)
  })
})
