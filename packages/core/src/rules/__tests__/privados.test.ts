import { describe, expect, it } from 'vitest'

import {
  etiquetaClubDeal,
  FONDO_OPORTUNIDAD,
  FONDO_PE_VC,
  FONDO_PRIVATE_CREDIT,
  FONDO_RE_INFRA,
  NOTA_INSTITUCIONAL,
  OTROS_IBIT,
  repartirPrivados,
} from '../privados.js'

/** Pesos de la hoja Data, perfil Moderado. */
const PESOS_MODERADO = {
  clase: 0.31081141150218566,
  club: 0.09133824666838504,
  otros: 0.005502304016167772,
}

const PESOS_ARRIESGADO = {
  clase: 0.4773035990406503,
  club: 0.09053724418058932,
  otros: 0.055060898360530526,
}

const OPC = { perfil: 'Moderado' as const, pesos: PESOS_MODERADO, ticketMinimo: 20_000 }

const monto = (r: { instrumento: string; usd: number }[], nombre: string) =>
  r.find((x) => x.instrumento === nombre)?.usd ?? 0

describe('repartirPrivados', () => {
  describe('caso Ana Tumi', () => {
    // Objetivo de la clase que produce el solver de pisos.
    const r = repartirPrivados(231_323.25263580168, OPC)

    it('reparte el club según su peso relativo dentro de la clase', () => {
      expect(monto(r, 'Fondo Edifica Diversificado Clase B')).toBeCloseTo(67_979.03657161386, 4)
    })

    it('elige Clase B porque el club no llega a 70,000', () => {
      expect(r.some((x) => x.instrumento.endsWith('Clase B'))).toBe(true)
      expect(r.some((x) => x.instrumento.endsWith('Clase A'))).toBe(false)
    })

    it('disuelve Otros, que no llega al ticket mínimo', () => {
      // Le tocarían 4,095 y el mínimo es 20,000.
      expect(monto(r, OTROS_IBIT)).toBe(0)
    })

    it('abre los dos fondos institucionales a la mitad', () => {
      expect(monto(r, FONDO_RE_INFRA)).toBeCloseTo(81_672.10803209392, 4)
      expect(monto(r, FONDO_PRIVATE_CREDIT)).toBeCloseTo(81_672.10803209392, 4)
      expect(monto(r, FONDO_PE_VC)).toBe(0)
    })

    it('arrastra la nota institucional en los fondos FM', () => {
      for (const nombre of [FONDO_RE_INFRA, FONDO_PRIVATE_CREDIT]) {
        expect(r.find((x) => x.instrumento === nombre)?.nota).toBe(NOTA_INSTITUCIONAL)
      }
    })

    it('cierra exacto contra el objetivo de la clase', () => {
      expect(r.reduce((acc, x) => acc + x.usd, 0)).toBeCloseTo(231_323.25263580168, 6)
    })

    it('devuelve las líneas de mayor a menor', () => {
      const montos = r.map((x) => x.usd)
      expect(montos).toStrictEqual([...montos].sort((a, b) => b - a))
    })
  })

  describe('regla de todo o nada', () => {
    it('no abre ningún subfondo si uno no llega a 50,000', () => {
      // Objetivo chico: a cada mitad le tocarían menos de 50,000.
      const r = repartirPrivados(120_000, OPC)
      expect(monto(r, FONDO_OPORTUNIDAD)).toBeGreaterThan(0)
      expect(monto(r, FONDO_RE_INFRA)).toBe(0)
      expect(monto(r, FONDO_PRIVATE_CREDIT)).toBe(0)
    })

    it('los abre en cuanto los dos superan el mínimo', () => {
      const r = repartirPrivados(200_000, OPC)
      expect(monto(r, FONDO_RE_INFRA)).toBeGreaterThanOrEqual(50_000)
      expect(monto(r, FONDO_PRIVATE_CREDIT)).toBeGreaterThanOrEqual(50_000)
      expect(monto(r, FONDO_OPORTUNIDAD)).toBe(0)
    })
  })

  describe('umbrales por familia', () => {
    it('disuelve el club cuando no llega a 10,000 y engorda oportunidad', () => {
      const r = repartirPrivados(30_000, OPC)
      // Al club le tocarían 8,817: por debajo del mínimo.
      expect(r.every((x) => x.familia !== 'club')).toBe(true)
      expect(monto(r, FONDO_OPORTUNIDAD)).toBeCloseTo(30_000, 6)
    })

    it('conserva el club cuando el asesor lo clava, aunque no llegue', () => {
      const r = repartirPrivados(30_000, { ...OPC, clubFijado: true })
      expect(r.some((x) => x.familia === 'club')).toBe(true)
    })

    it('abre Otros cuando el peso del perfil lo hace superar el ticket', () => {
      // Arriesgado le da a Otros un 11.5% de la clase.
      const r = repartirPrivados(500_000, {
        perfil: 'Arriesgado',
        pesos: PESOS_ARRIESGADO,
        ticketMinimo: 20_000,
      })
      expect(monto(r, OTROS_IBIT)).toBeGreaterThan(20_000)
    })
  })

  describe('perfil Arriesgado', () => {
    const r = repartirPrivados(600_000, {
      perfil: 'Arriesgado',
      pesos: PESOS_ARRIESGADO,
      ticketMinimo: 20_000,
    })

    it('vuelca el split a private equity y deja fuera real estate', () => {
      expect(monto(r, FONDO_RE_INFRA)).toBe(0)
      expect(monto(r, FONDO_PE_VC)).toBeGreaterThan(monto(r, FONDO_PRIVATE_CREDIT))
    })

    it('reparte 30/70 entre crédito privado y private equity', () => {
      const total = monto(r, FONDO_PRIVATE_CREDIT) + monto(r, FONDO_PE_VC)
      expect(monto(r, FONDO_PRIVATE_CREDIT) / total).toBeCloseTo(0.3, 6)
      expect(monto(r, FONDO_PE_VC) / total).toBeCloseTo(0.7, 6)
    })
  })

  describe('bordes', () => {
    it('no reparte nada sin objetivo', () => {
      expect(repartirPrivados(0, OPC)).toStrictEqual([])
    })

    it('manda todo a oportunidad si la clase no tiene peso', () => {
      const r = repartirPrivados(100_000, {
        ...OPC,
        pesos: { clase: 0, club: 0, otros: 0 },
      })
      expect(r).toStrictEqual([
        { instrumento: FONDO_OPORTUNIDAD, usd: 100_000, familia: 'oportunidad' },
      ])
    })

    it('siempre cierra exacto contra el objetivo', () => {
      for (const m of [15_000, 30_000, 120_000, 231_323.25, 1_000_000, 5_000_000]) {
        const r = repartirPrivados(m, OPC)
        expect(r.reduce((acc, x) => acc + x.usd, 0)).toBeCloseTo(m, 6)
      }
    })

    it('es puro', () => {
      expect(repartirPrivados(231_323.25, OPC)).toStrictEqual(repartirPrivados(231_323.25, OPC))
    })
  })

  describe('etiquetaClubDeal', () => {
    it('cambia de clase exactamente en 70,000', () => {
      expect(etiquetaClubDeal(69_999.99)).toContain('Clase B')
      expect(etiquetaClubDeal(70_000)).toContain('Clase A')
    })
  })
})
