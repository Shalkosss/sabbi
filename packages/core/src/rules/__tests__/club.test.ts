import { describe, expect, it } from 'vitest'

import { etiquetaClubDeal, FONDO_ESTRATEGICO, repartirClub } from '../club.js'

describe('repartirClub', () => {
  it('elige Clase B por debajo de 70,000', () => {
    // Cifra del caso Ana Tumi: el club queda en 67,979 y la propuesta dice B.
    const r = repartirClub(67_979.03657161386)
    expect(r?.instrumento).toBe('Fondo Edifica Diversificado Clase B')
    expect(r?.usd).toBeCloseTo(67_979.03657161386, 6)
  })

  it('elige Clase A desde 70,000', () => {
    expect(repartirClub(70_000)?.instrumento).toBe('Fondo Edifica Diversificado Clase A')
  })

  it('no se abre por debajo del mínimo de 10,000', () => {
    expect(repartirClub(9_999)).toBeNull()
    expect(repartirClub(0)).toBeNull()
  })

  it('se abre justo en el mínimo', () => {
    expect(repartirClub(10_000)?.usd).toBe(10_000)
  })

  it('con flujos activos va a Sabbi Fondo Estratégico, no a Edifica', () => {
    const r = repartirClub(67_979.03657161386, { necesitaFlujos: true })
    expect(r?.instrumento).toBe(FONDO_ESTRATEGICO)
  })

  it('el mínimo aplica también con flujos', () => {
    expect(repartirClub(9_000, { necesitaFlujos: true })).toBeNull()
  })
})

describe('etiquetaClubDeal', () => {
  it('cambia de clase exactamente en 70,000', () => {
    expect(etiquetaClubDeal(69_999.99)).toContain('Clase B')
    expect(etiquetaClubDeal(70_000)).toContain('Clase A')
  })
})
