import { describe, expect, it } from 'vitest'

import { repartirEtfs } from '../cascada.js'

/**
 * La cascada de ETFs de la v4.
 *
 * Una sola regla para Fijo y para Variable: consolidar si la clase no llega, y
 * si llega, matar al mas chico que no pase el ticket repartiendo su monto
 * entre los que quedan. Lo que se comprueba en cada caso es lo mismo que en la
 * hoja: el dinero cierra y ninguna linea que sobrevive queda por debajo del
 * ticket.
 */

const PESOS = { A: 0.4, B: 0.3, C: 0.2, D: 0.1 }
const OPCIONES = { ticketMinimo: 20_000, fallback: 'Flip Panda' }

const suma = (lineas: readonly { usd: number }[]) => lineas.reduce((acc, l) => acc + l.usd, 0)

describe('repartirEtfs', () => {
  it('sin monto no abre nada', () => {
    expect(repartirEtfs(PESOS, 0, OPCIONES)).toEqual([])
  })

  it('exige un ticket minimo positivo', () => {
    expect(() => repartirEtfs(PESOS, 100_000, { ...OPCIONES, ticketMinimo: 0 })).toThrow(
      /mayor que cero/,
    )
  })

  it('sin instrumentos, todo al de consolidacion', () => {
    const lineas = repartirEtfs({}, 100_000, OPCIONES)
    expect(lineas).toEqual([{ nombre: 'Flip Panda', usd: 100_000 }])
  })

  it('la clase que no llega al ticket se consolida en una sola linea', () => {
    const lineas = repartirEtfs(PESOS, 15_000, OPCIONES)
    expect(lineas).toEqual([{ nombre: 'Flip Panda', usd: 15_000 }])
  })

  it('con dinero de sobra abren todos y respetan su peso', () => {
    const lineas = repartirEtfs(PESOS, 1_000_000, OPCIONES)

    expect(lineas).toHaveLength(4)
    expect(suma(lineas)).toBeCloseTo(1_000_000, 6)
    expect(lineas[0]?.nombre).toBe('A')
    expect(lineas[0]?.usd).toBeCloseTo(400_000, 6)
    expect(lineas[3]?.nombre).toBe('D')
    expect(lineas[3]?.usd).toBeCloseTo(100_000, 6)
  })

  it('mata al mas chico y reparte su monto entre los que quedan', () => {
    // 100,000: A=40k B=30k C=20k D=10k. D no llega y se reparte entre los tres.
    const lineas = repartirEtfs(PESOS, 100_000, OPCIONES)

    expect(lineas.map((l) => l.nombre)).toEqual(['A', 'B', 'C'])
    expect(suma(lineas)).toBeCloseTo(100_000, 6)
    // El reparto es a prorrata de lo que cada uno ya tenia.
    expect(lineas[0]?.usd).toBeCloseTo(40_000 + 10_000 * (40 / 90), 6)
    expect(lineas[2]?.usd).toBeCloseTo(20_000 + 10_000 * (20 / 90), 6)
  })

  it('repite hasta que ninguno quede por debajo del ticket', () => {
    // 60,000: A=24k B=18k C=12k D=6k. Caen D y despues C.
    const lineas = repartirEtfs(PESOS, 60_000, OPCIONES)

    expect(suma(lineas)).toBeCloseTo(60_000, 6)
    for (const linea of lineas) {
      expect(linea.usd, linea.nombre).toBeGreaterThanOrEqual(20_000 - 0.01)
    }
  })

  it('ninguna linea sobreviviente queda bajo el ticket, en todo el rango', () => {
    for (let monto = 20_000; monto <= 400_000; monto += 7_500) {
      const lineas = repartirEtfs(PESOS, monto, OPCIONES)
      expect(suma(lineas), String(monto)).toBeCloseTo(monto, 6)
      for (const linea of lineas) {
        expect(linea.usd, `${monto} · ${linea.nombre}`).toBeGreaterThanOrEqual(20_000 - 0.01)
      }
    }
  })

  it('sale ordenado de mayor a menor', () => {
    const lineas = repartirEtfs(PESOS, 1_000_000, OPCIONES)
    const montos = lineas.map((l) => l.usd)
    expect([...montos].sort((a, b) => b - a)).toEqual(montos)
  })

  it('ignora los instrumentos con peso cero', () => {
    const lineas = repartirEtfs({ ...PESOS, E: 0 }, 1_000_000, OPCIONES)
    expect(lineas.map((l) => l.nombre)).not.toContain('E')
  })

  it('con un solo instrumento se lo lleva todo', () => {
    const lineas = repartirEtfs({ A: 1 }, 100_000, OPCIONES)
    expect(lineas).toHaveLength(1)
    expect(lineas[0]?.usd).toBeCloseTo(100_000, 6)
  })
})
