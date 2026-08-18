import { describe, expect, it } from 'vitest'

import type { Benchmark, LineaPlan, Piso } from '../domain/tipos.js'
import { generarPlan, INMOBILIARIO_TBD } from '../plan.js'
import type { EntradaPlan } from '../plan.js'
import { UMBRAL_INMOBILIARIO } from '../rules/inmobiliario.js'
import {
  FONDO_DIVIDENDOS_GLOBAL,
  FONDO_ESTRATEGICO,
  FONDO_OPORTUNIDAD,
  FONDO_RE_INFRA,
  NOTA_INSTITUCIONAL,
} from '../rules/privados.js'

/**
 * Golden test del caso Ana Tumi.
 *
 * Los objetivos por clase, la base de redistribucion y el total se comparan
 * contra `Propuesta Ana Tumi.xlsx` al centavo. Las lineas de ETF no: la
 * propuesta es del 11 de agosto y el motor paso por v6 y v8 despues, asi que
 * estan re-baselinizadas a la salida de v8.
 */

/** Pesos exactos de Data!E, perfil Moderado. */
const BENCHMARK: Benchmark = {
  inm: 0.24030062266972713,
  fijo: 0.18987950950338972,
  variable: 0.1642687853554088,
  privados: 0.31081141150218566,
  cash: 0.09473967096928874,
}

const PESOS_FIJO = {
  LQDA: 0.05819683667896101,
  IBTA: 0.0429078372124543,
  IBTM: 0.06312877199073737,
  IHYA: 0.017754967122394882,
  JPEA: 0.007891096498842171,
}

const PESOS_VARIABLE = {
  'iShares Core S&P 500': 0.11538880532282371,
  EIMI: 0.018964363837778896,
  EMUU: 0.011752563505102417,
  IJPA: 0.010149941208952086,
  ISFD: 0.008013111480751647,
}

const PESOS_PRIVADOS = {
  clase: 0.31081141150218566,
  club: 0.09133824666838504,
  otros: 0.005502304016167772,
}

const PATRIMONIO = 1_264_392.99

const PISOS: readonly Piso[] = [
  { clase: 'inm', montoUsd: 555_000, origen: 'conservado', etiqueta: 'Inmuebles de renta' },
  { clase: 'cash', montoUsd: 214_492.75, origen: 'conservado', etiqueta: 'Money Market' },
  { clase: 'fijo', montoUsd: 16_000, origen: 'conservado', etiqueta: 'DPF Caja Huancayo 2' },
]

const ENTRADA: EntradaPlan = {
  perfil: 'Moderado',
  patrimonioTotalUsd: PATRIMONIO,
  benchmark: BENCHMARK,
  pesos: { fijo: PESOS_FIJO, variable: PESOS_VARIABLE, privados: PESOS_PRIVADOS },
  pisos: PISOS,
  ticketMinimoUsd: 20_000,
  fallbacks: { fijo: 'Flip Panda', variable: 'Flip Cobra' },
}

const objetivo = (plan: ReturnType<typeof generarPlan>, clase: string) =>
  plan.reparto.porClase.find((c) => c.clase === clase)?.objetivoUsd ?? 0

const monto = (lineas: readonly LineaPlan[], instrumento: string) =>
  lineas.find((l) => l.instrumento === instrumento)?.usd ?? 0

const sumaClase = (lineas: readonly LineaPlan[], clase: string) =>
  lineas.filter((l) => l.clase === clase).reduce((acc, l) => acc + l.usd, 0)

describe('generarPlan — caso Ana Tumi', () => {
  const plan = generarPlan(ENTRADA)

  describe('reparto por clase', () => {
    it('reproduce la base de redistribucion del Excel', () => {
      expect(plan.reparto.baseRedistribucion).toBeCloseTo(744_255.9831307061, 4)
    })

    it('cierra inmobiliario y cash en lo conservado', () => {
      expect(objetivo(plan, 'inm')).toBeCloseTo(555_000, 4)
      expect(objetivo(plan, 'cash')).toBeCloseTo(214_492.75, 4)
    })

    it('reproduce los tres objetivos de clase abiertos', () => {
      expect(objetivo(plan, 'fijo')).toBeCloseTo(141_318.9610218216, 4)
      expect(objetivo(plan, 'variable')).toBeCloseTo(122_258.0263423767, 4)
      expect(objetivo(plan, 'privados')).toBeCloseTo(231_323.25263580168, 4)
    })

    it('no toca el inmobiliario: el ticket supera el umbral', () => {
      expect(PATRIMONIO).toBeGreaterThan(UMBRAL_INMOBILIARIO)
      expect(plan.avisos).toStrictEqual([])
    })
  })

  describe('totales', () => {
    it('las lineas suman el patrimonio invertible', () => {
      expect(plan.totalObjetivoUsd).toBeCloseTo(PATRIMONIO, 2)
    })

    it('las compras igualan el dinero disponible', () => {
      expect(plan.dineroNuevoUsd).toBeCloseTo(478_900.24, 2)
    })

    it('cada bloque cierra contra su objetivo de clase', () => {
      for (const clase of ['inm', 'fijo', 'variable', 'privados', 'cash'] as const) {
        expect(sumaClase(plan.lineas, clase)).toBeCloseTo(objetivo(plan, clase), 4)
      }
    })
  })

  describe('lineas', () => {
    it('conserva lo mantenido como linea propia', () => {
      expect(monto(plan.lineas, 'DPF Caja Huancayo 2')).toBe(16_000)
      expect(monto(plan.lineas, 'Money Market')).toBe(214_492.75)
      expect(monto(plan.lineas, 'Inmuebles de renta')).toBe(555_000)
    })

    it('no propone inmobiliario nuevo: la clase esta cerrada en su piso', () => {
      expect(monto(plan.lineas, INMOBILIARIO_TBD)).toBe(0)
    })

    it('reparte Fijo con la cascada v8', () => {
      expect(monto(plan.lineas, 'IBTM')).toBeCloseTo(40_482.96, 2)
      expect(monto(plan.lineas, 'LQDA')).toBeCloseTo(37_320.23, 2)
      expect(monto(plan.lineas, 'IBTA')).toBeCloseTo(27_515.76, 2)
      expect(monto(plan.lineas, 'IHYA')).toBeCloseTo(20_000, 2)
      expect(monto(plan.lineas, 'JPEA')).toBe(0)
    })

    it('reparte Variable con el motor de nucleo y satelites', () => {
      expect(monto(plan.lineas, 'iShares Core S&P 500')).toBeCloseTo(85_878.8087, 3)
      expect(monto(plan.lineas, 'EIMI')).toBeCloseTo(36_379.2176, 3)
    })

    it('reproduce Mercados Privados al centavo', () => {
      expect(monto(plan.lineas, 'Fondo Edifica Diversificado Clase B')).toBeCloseTo(67_979.04, 2)
      expect(monto(plan.lineas, FONDO_RE_INFRA)).toBeCloseTo(81_672.11, 2)
      expect(monto(plan.lineas, 'FM PC')).toBeCloseTo(81_672.11, 2)
    })

    it('ninguna linea queda bajo el ticket minimo, salvo las exentas', () => {
      for (const l of plan.lineas) {
        if (l.residuales === undefined) expect(l.usd).toBeGreaterThanOrEqual(20_000)
      }
    })

    it('ordena por bloque y, dentro del bloque, de mayor a menor', () => {
      const orden = ['inm', 'fijo', 'variable', 'privados', 'cash']
      let anterior = -1
      for (const l of plan.lineas) {
        const bloque = orden.indexOf(l.clase)
        expect(bloque).toBeGreaterThanOrEqual(anterior)
        anterior = bloque
      }
      const fijo = plan.lineas.filter((l) => l.clase === 'fijo').map((l) => l.usd)
      expect(fijo).toStrictEqual([...fijo].sort((a, b) => b - a))
    })
  })

  it('es puro', () => {
    expect(generarPlan(ENTRADA)).toStrictEqual(generarPlan(ENTRADA))
  })
})

describe('generarPlan — toggles', () => {
  it('con flujos activos saca a los fondos mutuos y avisa', () => {
    const plan = generarPlan({ ...ENTRADA, necesitaFlujos: true })

    expect(monto(plan.lineas, FONDO_RE_INFRA)).toBe(0)
    expect(monto(plan.lineas, FONDO_ESTRATEGICO)).toBeCloseTo(67_979.04, 2)
    expect(monto(plan.lineas, FONDO_DIVIDENDOS_GLOBAL)).toBeCloseTo(163_344.22, 2)
    expect(plan.totalObjetivoUsd).toBeCloseTo(PATRIMONIO, 2)
    expect(plan.avisos.some((a) => a.includes('Flujos activos'))).toBe(true)
  })

  it('disuelve el inmobiliario con ticket bajo 500,000', () => {
    const plan = generarPlan({
      ...ENTRADA,
      patrimonioTotalUsd: 300_000,
      pisos: [],
    })

    expect(objetivo(plan, 'inm')).toBe(0)
    expect(monto(plan.lineas, INMOBILIARIO_TBD)).toBe(0)
    expect(plan.totalObjetivoUsd).toBeCloseTo(300_000, 2)
    expect(plan.avisos.some((a) => a.includes('prorrateo'))).toBe(true)
  })

  it('conserva el inmobiliario con ticket bajo si el asesor lo clava', () => {
    const plan = generarPlan({
      ...ENTRADA,
      patrimonioTotalUsd: 300_000,
      pisos: [],
      inmFijado: true,
    })

    expect(objetivo(plan, 'inm')).toBeGreaterThan(0)
    expect(plan.avisos.some((a) => a.includes('conservado por restriccion'))).toBe(true)
  })

  it('en automatico abre los fondos mutuos con la nota y no avisa nada', () => {
    const plan = generarPlan(ENTRADA)

    expect(monto(plan.lineas, FONDO_RE_INFRA)).toBeCloseTo(81_672.11, 2)
    expect(plan.lineas.find((l) => l.instrumento === FONDO_RE_INFRA)?.nota).toBe(
      NOTA_INSTITUCIONAL,
    )
    expect(plan.avisos.some((a) => a.includes('Check institucional'))).toBe(false)
  })

  it('con el check forzado a no cierra los fondos mutuos y avisa', () => {
    const plan = generarPlan({ ...ENTRADA, institucional: 'no' })

    expect(monto(plan.lineas, FONDO_RE_INFRA)).toBe(0)
    expect(monto(plan.lineas, FONDO_OPORTUNIDAD)).toBeCloseTo(163_344.22, 2)
    expect(plan.totalObjetivoUsd).toBeCloseTo(PATRIMONIO, 2)
    expect(plan.avisos.some((a) => a.includes('Check institucional forzado a no'))).toBe(true)
  })

  it('con el check forzado a si abre los fondos mutuos sin la nota y avisa', () => {
    const plan = generarPlan({ ...ENTRADA, institucional: 'si' })

    expect(monto(plan.lineas, FONDO_RE_INFRA)).toBeCloseTo(81_672.11, 2)
    expect(plan.lineas.every((l) => l.nota !== NOTA_INSTITUCIONAL)).toBe(true)
    expect(plan.avisos.some((a) => a.includes('Check institucional forzado a si'))).toBe(true)
  })

  it('rechaza un ticket minimo invalido', () => {
    expect(() => generarPlan({ ...ENTRADA, ticketMinimoUsd: 0 })).toThrow(/ticket minimo/i)
  })
})
