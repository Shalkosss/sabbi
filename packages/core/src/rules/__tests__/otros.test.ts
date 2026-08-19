import { describe, expect, it } from 'vitest'

import { OTROS_BTC, OTROS_ORO, repartirOtros } from '../otros.js'

/** Particion Moderado de la hoja Allocation detallado, renormalizada. */
const PESOS_MODERADO = {
  [OTROS_BTC]: 0.0046 / 0.005525,
  [OTROS_ORO]: 0.000925 / 0.005525,
}

const monto = (r: readonly { instrumento: string; usd: number }[] | null, nombre: string) =>
  r?.find((x) => x.instrumento === nombre)?.usd ?? 0

describe('repartirOtros', () => {
  it('no se abre por debajo del mínimo de la clase', () => {
    expect(repartirOtros(9_999, PESOS_MODERADO)).toBeNull()
    expect(repartirOtros(0, PESOS_MODERADO)).toBeNull()
  })

  it('con monto chico todo queda en BTC: el oro no llega a su mínimo', () => {
    // 16.74% de 30,000 son 5,022 de oro: por debajo de 10,000.
    const r = repartirOtros(30_000, PESOS_MODERADO)
    expect(monto(r, OTROS_BTC)).toBeCloseTo(30_000, 6)
    expect(r?.some((x) => x.instrumento === OTROS_ORO)).toBe(false)
  })

  it('abre las dos líneas cuando ambas superan el mínimo', () => {
    const r = repartirOtros(100_000, PESOS_MODERADO)
    expect(monto(r, OTROS_BTC)).toBeCloseTo(100_000 * (0.0046 / 0.005525), 4)
    expect(monto(r, OTROS_ORO)).toBeCloseTo(100_000 * (0.000925 / 0.005525), 4)
  })

  it('siempre cierra exacto contra el monto', () => {
    for (const m of [10_000, 30_000, 59_000, 100_000, 1_000_000]) {
      const r = repartirOtros(m, PESOS_MODERADO)
      expect(r?.reduce((acc, x) => acc + x.usd, 0)).toBeCloseTo(m, 6)
    }
  })

  it('sin pesos, todo va a BTC', () => {
    const r = repartirOtros(50_000, {})
    expect(monto(r, OTROS_BTC)).toBe(50_000)
  })

  it('con un solo instrumento en el perfil, la línea se lleva todo', () => {
    // Conservador: el oro pesa cero.
    const r = repartirOtros(25_000, { [OTROS_BTC]: 1 })
    expect(r).toStrictEqual([{ instrumento: OTROS_BTC, usd: 25_000 }])
  })

  it('es puro', () => {
    expect(repartirOtros(100_000, PESOS_MODERADO)).toStrictEqual(
      repartirOtros(100_000, PESOS_MODERADO),
    )
  })
})
