import { describe, expect, it } from 'vitest'

import { repartirEtfs } from '../cascada.js'

const OPC = { ticketMinimo: 20_000, fallback: 'Flip - Panda Zen' }

/** Pesos sobre el patrimonio total, tal como los guarda la hoja Data. */
const FIJO_MODERADO = {
  'iShares $ Corporate Bond': 0.05819683667896101,
  'iShares $ Treasury 1-3yr': 0.0429078372124543,
  'iShares $ Treasury 7-10yr': 0.06312877199073737,
  'iShares $ High Yield Corp': 0.017754967122394882,
  'iShares JPM EM Bond': 0.007891096498842171,
}

const VARIABLE_MODERADO = {
  'iShares Core S&P 500': 0.11538880532282371,
  'iShares Core MSCI EM IMI': 0.018964363837778896,
  'iShares Core MSCI EMU': 0.011752563505102417,
  'iShares Core MSCI Japan IMI': 0.010149941208952086,
  'iShares Core FTSE 100': 0.008013111480751647,
}

const monto = (r: { nombre: string; usd: number }[], nombre: string) =>
  r.find((x) => x.nombre === nombre)?.usd ?? 0

describe('repartirEtfs — motor v8', () => {
  describe('caso Ana Tumi, dinero nuevo de fijo', () => {
    const r = repartirEtfs(FIJO_MODERADO, 125_318.9610218216, OPC)

    it('rescata el high yield hasta el ticket mínimo exacto', () => {
      // La cascada anterior lo descartaba por quedar bajo el mínimo. v8 solo
      // descarta lo que no llega ni a la mitad, así que este entra clavado.
      expect(monto(r, 'iShares $ High Yield Corp')).toBeCloseTo(20_000, 6)
    })

    it('deja fuera el bono emergente, que no llega ni a medio ticket', () => {
      expect(monto(r, 'iShares JPM EM Bond')).toBe(0)
      expect(r.map((x) => x.nombre)).not.toContain('iShares JPM EM Bond')
    })

    it('reparte el resto en proporción a los pesos', () => {
      expect(monto(r, 'iShares $ Treasury 7-10yr')).toBeCloseTo(40_482.963996, 4)
      expect(monto(r, 'iShares $ Corporate Bond')).toBeCloseTo(37_320.232434, 4)
      expect(monto(r, 'iShares $ Treasury 1-3yr')).toBeCloseTo(27_515.764591, 4)
    })

    it('cierra exacto contra el monto a repartir', () => {
      const total = r.reduce((acc, x) => acc + x.usd, 0)
      expect(total).toBeCloseTo(125_318.9610218216, 6)
    })

    it('devuelve las líneas de mayor a menor', () => {
      const montos = r.map((x) => x.usd)
      expect(montos).toStrictEqual([...montos].sort((a, b) => b - a))
    })
  })

  describe('caso Ana Tumi, dinero nuevo de variable', () => {
    const r = repartirEtfs(VARIABLE_MODERADO, 122_258.0263423767, OPC)

    it('deja el núcleo y un satélite rescatado al mínimo', () => {
      expect(monto(r, 'iShares Core S&P 500')).toBeCloseTo(102_258.026342, 4)
      expect(monto(r, 'iShares Core MSCI EM IMI')).toBeCloseTo(20_000, 6)
      expect(r).toHaveLength(2)
    })

    it('cierra exacto', () => {
      expect(r.reduce((acc, x) => acc + x.usd, 0)).toBeCloseTo(122_258.0263423767, 6)
    })
  })

  describe('cadena de separación', () => {
    it('escalona los pisos en 1.15 cuando entran los cinco', () => {
      const r = repartirEtfs(VARIABLE_MODERADO, 300_000, OPC)
      expect(r).toHaveLength(5)
      // 20,000 · 1.15 = 23,000 · 1.15 = 26,450
      expect(monto(r, 'iShares Core FTSE 100')).toBeCloseTo(20_000, 6)
      expect(monto(r, 'iShares Core MSCI Japan IMI')).toBeCloseTo(23_000, 6)
      expect(monto(r, 'iShares Core MSCI EMU')).toBeCloseTo(26_450, 6)
      expect(monto(r, 'iShares Core S&P 500')).toBeCloseTo(198_007.157058, 4)
      expect(r.reduce((acc, x) => acc + x.usd, 0)).toBeCloseTo(300_000, 6)
    })
  })

  describe('bordes', () => {
    it('manda todo al fallback cuando no alcanza para un ticket', () => {
      const r = repartirEtfs(FIJO_MODERADO, 15_000, OPC)
      expect(r).toStrictEqual([{ nombre: 'Flip - Panda Zen', usd: 15_000 }])
    })

    it('usa el fallback cuando el perfil no tiene pesos', () => {
      // Fijo con perfil Arriesgado: el benchmark le asigna 0%.
      const r = repartirEtfs({}, 50_000, OPC)
      expect(r).toStrictEqual([{ nombre: 'Flip - Panda Zen', usd: 50_000 }])
    })

    it('no reparte nada si no hay dinero nuevo', () => {
      expect(repartirEtfs(FIJO_MODERADO, 0, OPC)).toStrictEqual([])
    })

    it('nunca deja una línea por debajo del ticket mínimo', () => {
      for (const m of [20_000, 45_000, 80_000, 125_000, 260_000, 500_000, 1_000_000]) {
        const r = repartirEtfs(FIJO_MODERADO, m, OPC)
        for (const linea of r) {
          if (linea.nombre === OPC.fallback) continue
          expect(linea.usd).toBeGreaterThanOrEqual(20_000 - 0.01)
        }
      }
    })

    it('siempre reparte el total exacto', () => {
      for (const m of [20_000, 33_333.33, 125_318.96, 260_000, 987_654.321]) {
        const r = repartirEtfs(VARIABLE_MODERADO, m, OPC)
        expect(r.reduce((acc, x) => acc + x.usd, 0)).toBeCloseTo(m, 6)
      }
    })

    it('es puro: la misma entrada da la misma salida', () => {
      const a = repartirEtfs(FIJO_MODERADO, 125_318.96, OPC)
      const b = repartirEtfs(FIJO_MODERADO, 125_318.96, OPC)
      expect(a).toStrictEqual(b)
    })

    it('rechaza un ticket mínimo no positivo', () => {
      expect(() => repartirEtfs(FIJO_MODERADO, 100_000, { ...OPC, ticketMinimo: 0 })).toThrow(
        /mayor que cero/,
      )
    })
  })
})
