import { describe, expect, it } from 'vitest'

import { repartirVariable } from '../variable.js'

/** Pesos de Data!E (Moderado), renormalizados dentro de Variable. */
const PESOS = {
  'iShares Core S&P 500': 0.11538880532282371,
  'iShares Core MSCI Emerging Markets IMI ETF': 0.018964363837778896,
  'iShares Core MSCI EMU UCITS ETF USD Hedged': 0.011752563505102417,
  'iShares Core MSCI Japan IMI UCITS ETF': 0.010149941208952086,
  'iShares Core FTSE 100 UCITS ETF': 0.008013111480751647,
}

const OPC = { ticketMinimo: 20_000, fallback: 'Flip Cobra' }

const monto = (r: { nombre: string; usd: number }[], nombre: string) =>
  r.find((x) => x.nombre === nombre)?.usd ?? 0

const NUCLEO = 'iShares Core S&P 500'
const EIMI = 'iShares Core MSCI Emerging Markets IMI ETF'

describe('repartirVariable', () => {
  describe('caso Ana Tumi', () => {
    // Dinero nuevo de Variable que produce el solver de pisos.
    const r = repartirVariable(PESOS, 122_258.0263423767, OPC)

    it('deja el nucleo y un solo satelite', () => {
      expect(r.map((x) => x.nombre)).toStrictEqual([NUCLEO, EIMI])
    })

    it('el prorrateo satelital es exclusivo: el nucleo no crece con los restos', () => {
      // Su peso relativo dentro de la clase, intacto: 122,258.03 x 70.24%.
      expect(monto(r, NUCLEO)).toBeCloseTo(85_878.8087, 3)
    })

    it('el satelite sobreviviente absorbe a los tres que murieron', () => {
      // Todo lo que no es nucleo termina en el unico satelite que aguanta.
      expect(monto(r, EIMI)).toBeCloseTo(36_379.2176, 3)
    })

    it('cierra exacto contra el dinero nuevo', () => {
      expect(r.reduce((acc, x) => acc + x.usd, 0)).toBeCloseTo(122_258.0263423767, 6)
    })
  })

  describe('rescate de rango', () => {
    it('rescata al unico satelite que queda entre 14,500 y el ticket', () => {
      // Un satelite solo, con el 15% del bloque: 15,000 sobre 100,000.
      const r = repartirVariable({ 'S&P 500': 0.85, satelite: 0.15 }, 100_000, OPC)
      // Le faltan 5,000 exactos; el bloque siguiente de mil son 6,000.
      expect(monto(r, 'satelite')).toBeCloseTo(21_000, 6)
      expect(monto(r, 'S&P 500')).toBeCloseTo(79_000, 6)
    })

    it('no rescata al que no llega al piso de 14,500 y lo absorbe el nucleo', () => {
      const r = repartirVariable({ 'S&P 500': 0.9, satelite: 0.1 }, 100_000, OPC)
      expect(r).toHaveLength(1)
      expect(monto(r, 'S&P 500')).toBeCloseTo(100_000, 6)
    })

    it('cierra exacto despues de financiar el rescate', () => {
      const r = repartirVariable({ 'S&P 500': 0.85, satelite: 0.15 }, 100_000, OPC)
      expect(r.reduce((acc, x) => acc + x.usd, 0)).toBeCloseTo(100_000, 6)
    })
  })

  describe('separacion del 10%', () => {
    it('separa satelites pegados y se lo cobra al nucleo', () => {
      const r = repartirVariable(
        { 'S&P 500': 0.6, satA: 0.205, satB: 0.195 },
        200_000,
        OPC,
      )
      const a = monto(r, 'satA')
      const b = monto(r, 'satB')
      const [menor, mayor] = a <= b ? [a, b] : [b, a]
      expect(mayor / menor).toBeGreaterThanOrEqual(1.1 - 1e-9)
      expect(r.reduce((acc, x) => acc + x.usd, 0)).toBeCloseTo(200_000, 6)
    })
  })

  describe('bordes', () => {
    it('consolida el bloque entero si no llega a un ticket', () => {
      const r = repartirVariable(PESOS, 15_000, OPC)
      expect(r).toStrictEqual([{ nombre: 'Flip Cobra', usd: 15_000 }])
    })

    it('consolida si no hay nucleo reconocible', () => {
      const r = repartirVariable({ satA: 0.5, satB: 0.5 }, 100_000, OPC)
      expect(r).toStrictEqual([{ nombre: 'Flip Cobra', usd: 100_000 }])
    })

    it('colapsa a una sola linea si el nucleo no llega al ticket', () => {
      // Al nucleo le tocan 4,620 de 21,000: por debajo del minimo de 5,000.
      const r = repartirVariable({ 'S&P 500': 0.22, satelite: 0.78 }, 21_000, {
        ticketMinimo: 5_000,
        fallback: 'Flip Cobra',
      })
      expect(r).toStrictEqual([{ nombre: 'S&P 500', usd: 21_000 }])
    })

    it('no reparte nada sin monto', () => {
      expect(repartirVariable(PESOS, 0, OPC)).toStrictEqual([])
    })

    it('rechaza un ticket minimo invalido', () => {
      expect(() => repartirVariable(PESOS, 100_000, { ...OPC, ticketMinimo: 0 })).toThrow(
        /ticket minimo/i,
      )
    })

    it('es puro', () => {
      expect(repartirVariable(PESOS, 122_258.03, OPC)).toStrictEqual(
        repartirVariable(PESOS, 122_258.03, OPC),
      )
    })
  })
})
