import { describe, expect, it } from 'vitest'

import {
  FONDO_DIVIDENDOS_GLOBAL,
  FONDO_OPORTUNIDAD,
  FONDO_PE_VC,
  FONDO_PRIVATE_CREDIT,
  FONDO_RE_INFRA,
  NOTA_INSTITUCIONAL,
  repartirPrivados,
} from '../privados.js'

/**
 * Desde la separacion de Club Deals y Otros en clases propias, esta rutina
 * recibe el dinero nuevo de Mercados Privados directamente: el neteo por
 * familia lo hace el solver de pisos. Las cifras de referencia son las de la
 * familia oportunidad del caso Ana Tumi: 163,344.22 tras descontar el club.
 */

const OPC = { perfil: 'Moderado' as const }

const monto = (r: { instrumento: string; usd: number }[], nombre: string) =>
  r.find((x) => x.instrumento === nombre)?.usd ?? 0

describe('repartirPrivados', () => {
  describe('caso Ana Tumi (familia oportunidad)', () => {
    const r = repartirPrivados(163_344.2160641878, OPC)

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

    it('cierra exacto contra el monto recibido', () => {
      expect(r.reduce((acc, x) => acc + x.usd, 0)).toBeCloseTo(163_344.2160641878, 6)
    })
  })

  describe('regla de todo o nada', () => {
    it('no abre ningún subfondo si uno no llega a 50,000', () => {
      // A cada mitad le tocarían 45,000.
      const r = repartirPrivados(90_000, OPC)
      expect(monto(r, FONDO_OPORTUNIDAD)).toBeCloseTo(90_000, 6)
      expect(monto(r, FONDO_RE_INFRA)).toBe(0)
      expect(monto(r, FONDO_PRIVATE_CREDIT)).toBe(0)
    })

    it('los abre en cuanto todos superan el mínimo', () => {
      const r = repartirPrivados(120_000, OPC)
      expect(monto(r, FONDO_RE_INFRA)).toBeGreaterThanOrEqual(50_000)
      expect(monto(r, FONDO_PRIVATE_CREDIT)).toBeGreaterThanOrEqual(50_000)
      expect(monto(r, FONDO_OPORTUNIDAD)).toBe(0)
    })

    it('el Fondo Oportunidad no tiene mínimo: recibe montos chicos', () => {
      const r = repartirPrivados(500, OPC)
      expect(monto(r, FONDO_OPORTUNIDAD)).toBeCloseTo(500, 6)
    })
  })

  describe('perfil Arriesgado', () => {
    const r = repartirPrivados(600_000, { perfil: 'Arriesgado' })

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
    it('no reparte nada sin monto', () => {
      expect(repartirPrivados(0, OPC)).toStrictEqual([])
    })

    it('siempre cierra exacto contra el monto', () => {
      for (const m of [500, 15_000, 30_000, 120_000, 231_323.25, 1_000_000, 5_000_000]) {
        const r = repartirPrivados(m, OPC)
        expect(r.reduce((acc, x) => acc + x.usd, 0)).toBeCloseTo(m, 6)
      }
    })

    it('es puro', () => {
      expect(repartirPrivados(231_323.25, OPC)).toStrictEqual(repartirPrivados(231_323.25, OPC))
    })
  })

  describe('regla de flujos', () => {
    const conFlujos = { ...OPC, necesitaFlujos: true }

    it('no abre ningun fondo mutuo: los FM no distribuyen', () => {
      const r = repartirPrivados(163_344.2160641878, conFlujos)
      expect(monto(r, FONDO_RE_INFRA)).toBe(0)
      expect(monto(r, FONDO_PRIVATE_CREDIT)).toBe(0)
      expect(monto(r, FONDO_PE_VC)).toBe(0)
    })

    it('manda el monto a Visión Dividendos Global si llega a su ticket', () => {
      const r = repartirPrivados(163_344.2160641878, conFlujos)
      expect(monto(r, FONDO_DIVIDENDOS_GLOBAL)).toBeCloseTo(163_344.2160641878, 4)
    })

    it('deja el monto en Fondo Oportunidad si no llega al ticket de Dividendos', () => {
      const r = repartirPrivados(70_612.9687, conFlujos)
      expect(monto(r, FONDO_DIVIDENDOS_GLOBAL)).toBe(0)
      expect(monto(r, FONDO_OPORTUNIDAD)).toBeCloseTo(70_612.9687, 3)
    })

    it('no cambia nada con el toggle apagado', () => {
      expect(repartirPrivados(231_323.25, OPC)).toStrictEqual(
        repartirPrivados(231_323.25, { ...OPC, necesitaFlujos: false }),
      )
    })

    it('nunca deja pasar un fondo mutuo, sea cual sea el monto', () => {
      for (const m of [15_000, 120_000, 231_323.25, 1_000_000, 5_000_000]) {
        const r = repartirPrivados(m, conFlujos)
        expect(r.some((x) => x.nota === NOTA_INSTITUCIONAL)).toBe(false)
        expect(r.reduce((acc, x) => acc + x.usd, 0)).toBeCloseTo(m, 6)
      }
    })
  })

  describe('check institucional', () => {
    const MONTO = 163_344.2160641878

    it('en automatico abre el split con la nota, como hace v8', () => {
      const r = repartirPrivados(MONTO, { ...OPC, institucional: 'auto' })

      expect(monto(r, FONDO_RE_INFRA)).toBeCloseTo(81_672.10803209392, 4)
      expect(r.find((x) => x.instrumento === FONDO_RE_INFRA)?.nota).toBe(NOTA_INSTITUCIONAL)
    })

    it('forzado a si abre el split sin la nota', () => {
      const r = repartirPrivados(MONTO, { ...OPC, institucional: 'si' })

      expect(monto(r, FONDO_RE_INFRA)).toBeCloseTo(81_672.10803209392, 4)
      expect(r.every((x) => x.nota === undefined)).toBe(true)
    })

    it('forzado a no deja todo en el Fondo Oportunidad', () => {
      const r = repartirPrivados(MONTO, { ...OPC, institucional: 'no' })

      expect(r.some((x) => x.instrumento === FONDO_RE_INFRA)).toBe(false)
      expect(r.some((x) => x.instrumento === FONDO_PRIVATE_CREDIT)).toBe(false)
      expect(monto(r, FONDO_OPORTUNIDAD)).toBeCloseTo(MONTO, 4)
    })

    it('el default es automatico: no pasar el estado no cambia nada', () => {
      expect(repartirPrivados(MONTO, OPC)).toEqual(
        repartirPrivados(MONTO, { ...OPC, institucional: 'auto' }),
      )
    })

    it('los flujos ganan al forzado a si: los FM siguen siendo iliquidos', () => {
      const r = repartirPrivados(MONTO, {
        ...OPC,
        institucional: 'si',
        necesitaFlujos: true,
      })

      expect(r.some((x) => x.instrumento === FONDO_RE_INFRA)).toBe(false)
      expect(monto(r, FONDO_DIVIDENDOS_GLOBAL)).toBeCloseTo(MONTO, 4)
    })
  })

  describe('los subfondos uno por uno, la regla de la v4', () => {
    // Arriesgado parte 30/70. Con 100,000 le tocan 30,000 a PC —corto— y
    // 70,000 a PE VC, que si llega a los 50,000.
    const ARRIESGADO = { perfil: 'Arriesgado' as const }

    it('con que uno califique se abre, aunque el otro no llegue', () => {
      const r = repartirPrivados(100_000, { ...ARRIESGADO, subfondos: 'uno_a_uno' })

      expect(r.map((x) => x.instrumento)).toStrictEqual([FONDO_PE_VC])
    })

    it('el que abre se lleva tambien el monto del que no llego', () => {
      const r = repartirPrivados(100_000, { ...ARRIESGADO, subfondos: 'uno_a_uno' })

      expect(monto(r, FONDO_PE_VC)).toBeCloseTo(100_000, 4)
    })

    it('con todo o nada, ese mismo monto se queda entero en el fondo', () => {
      const r = repartirPrivados(100_000, { ...ARRIESGADO, subfondos: 'todo_o_nada' })

      expect(r.map((x) => x.instrumento)).toStrictEqual([FONDO_OPORTUNIDAD])
      expect(monto(r, FONDO_OPORTUNIDAD)).toBeCloseTo(100_000, 4)
    })

    it('si ninguno califica, todo al fondo aunque se midan uno por uno', () => {
      const r = repartirPrivados(40_000, { ...ARRIESGADO, subfondos: 'uno_a_uno' })

      expect(r.map((x) => x.instrumento)).toStrictEqual([FONDO_OPORTUNIDAD])
    })

    it('si califican todos, los montos salen tal cual del split', () => {
      // Sin nada que redistribuir, las dos reglas tienen que dar lo mismo al
      // centavo: reescalar por un factor que vale uno meteria ruido.
      const holgado = 163_344.2160641878
      const uno = repartirPrivados(holgado, { ...OPC, subfondos: 'uno_a_uno' })
      const todo = repartirPrivados(holgado, { ...OPC, subfondos: 'todo_o_nada' })

      expect(uno).toStrictEqual(todo)
      expect(monto(uno, FONDO_RE_INFRA)).toBe(holgado * 0.5)
    })

    it('el default sigue siendo el todo o nada de la v8', () => {
      expect(repartirPrivados(100_000, ARRIESGADO)).toStrictEqual(
        repartirPrivados(100_000, { ...ARRIESGADO, subfondos: 'todo_o_nada' }),
      )
    })
  })
})
