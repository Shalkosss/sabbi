import { describe, expect, it } from 'vitest'

import { repartirPoda } from '../poda.js'

/**
 * El motor de mercados publicos de la v4.
 *
 * Lo que hay que fijar es que sea el algoritmo de la macro y no una version
 * amable de la cascada: sin rescate del que queda cerca, sin pisos escalonados
 * y sin limite de sacrificio. Un motor que "casi" hace lo mismo produce cifras
 * que despues no se pueden explicar contra la hoja.
 */

const OPC = { ticketMinimo: 20_000, fallback: 'Flip Panda' }

describe('repartirPoda', () => {
  it('reparte pro rata cuando todos llegan al ticket', () => {
    const r = repartirPoda({ A: 0.5, B: 0.5 }, 100_000, OPC)

    expect(r).toStrictEqual([
      { nombre: 'A', usd: 50_000 },
      { nombre: 'B', usd: 50_000 },
    ])
  })

  it('consolida la seccion entera cuando no llega ni a un ticket', () => {
    const r = repartirPoda({ A: 0.5, B: 0.5 }, 15_000, OPC)

    expect(r).toStrictEqual([{ nombre: 'Flip Panda', usd: 15_000 }])
  })

  it('saca al mas chico y le reparte su monto a los que quedan', () => {
    // C se lleva 5,000 de 100,000: no llega al ticket. Se reparte entre A y B
    // en proporcion a lo que ya tenian, 60/35 -> 63,158 / 36,842.
    const r = repartirPoda({ A: 0.6, B: 0.35, C: 0.05 }, 100_000, OPC)

    expect(r.map((a) => a.nombre)).toStrictEqual(['A', 'B'])
    expect(r[0]?.usd).toBeCloseTo(100_000 * (60 / 95), 6)
    expect(r[1]?.usd).toBeCloseTo(100_000 * (35 / 95), 6)
  })

  it('vuelve a mirar despues de repartir: un solo golpe no alcanza', () => {
    // D y C caen por debajo del ticket. Sacar solo a D dejaria a C en 10,526,
    // todavia corto: hay que volver a mirar. Al final quedan A y B.
    const r = repartirPoda({ A: 0.55, B: 0.3, C: 0.1, D: 0.05 }, 100_000, OPC)

    expect(r.map((a) => a.nombre)).toStrictEqual(['A', 'B'])
    expect(r.reduce((acc, a) => acc + a.usd, 0)).toBeCloseTo(100_000, 6)
  })

  it('no rescata al que queda cerca del minimo, a diferencia de la cascada', () => {
    // C se lleva 12,000 sobre 100,000: el 60% del ticket. La cascada de la v8
    // lo rescataria por su factor de descarte; la poda lo saca igual.
    const r = repartirPoda({ A: 0.58, B: 0.3, C: 0.12 }, 100_000, OPC)

    expect(r.map((a) => a.nombre)).toStrictEqual(['A', 'B'])
  })

  it('deja vivo al ultimo aunque no llegue al ticket', () => {
    // Con dos instrumentos y un monto que pasa el ticket de la seccion, sacar
    // al chico deja al grande con todo. Sacar al grande no tendria a quien
    // darle: el bucle corta y la linea sale con su nombre.
    const r = repartirPoda({ A: 0.9, B: 0.1 }, 21_000, OPC)

    expect(r).toStrictEqual([{ nombre: 'A', usd: 21_000 }])
  })

  it('conserva el total en cada vuelta', () => {
    const r = repartirPoda({ A: 0.4, B: 0.3, C: 0.2, D: 0.07, E: 0.03 }, 250_000, OPC)

    expect(r.reduce((acc, a) => acc + a.usd, 0)).toBeCloseTo(250_000, 6)
    for (const a of r) expect(a.usd).toBeGreaterThanOrEqual(20_000 - 0.01)
  })

  it('devuelve el fallback cuando no hay instrumentos con peso', () => {
    expect(repartirPoda({}, 50_000, OPC)).toStrictEqual([{ nombre: 'Flip Panda', usd: 50_000 }])
  })

  it('no devuelve nada con monto cero', () => {
    expect(repartirPoda({ A: 1 }, 0, OPC)).toStrictEqual([])
  })

  it('exige un ticket positivo', () => {
    expect(() => repartirPoda({ A: 1 }, 100_000, { ...OPC, ticketMinimo: 0 })).toThrow('ticket')
  })
})
