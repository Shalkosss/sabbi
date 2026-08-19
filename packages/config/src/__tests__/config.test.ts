import { describe, expect, it } from 'vitest'

import {
  benchmarkDe,
  benchmarks,
  benchmarksSchema,
  CLASES,
  pesosDeClase,
} from '../index.js'

describe('configuración de benchmarks', () => {
  it('carga y valida el archivo extraído de la hoja Data', () => {
    expect(benchmarks.version).toBe(4)
    expect(benchmarks.hoja).toContain('Data')
    expect(benchmarks.perfiles).toHaveLength(5)
  })

  it('conserva la precisión completa que el JSON v2 había perdido', () => {
    const moderado = benchmarkDe('Moderado')
    // Estos son los pesos que reproducen la propuesta de Ana Tumi al centavo.
    // El JSON v2 traía 0.2406 / 0.1898 / 0.1642 / 0.3052 / 0.1002.
    expect(moderado.inm).toBe(0.24030062266972713)
    expect(moderado.fijo).toBe(0.18987950950338972)
    expect(moderado.variable).toBe(0.1642687853554088)
    expect(moderado.cash).toBe(0.09473967096928874)
    // La clase Mercados Privados de la hoja, abierta en sus tres clases.
    expect(moderado.privados + moderado.club + moderado.otros).toBeCloseTo(
      0.31081141150218566,
      12,
    )
    expect(moderado.club).toBe(0.09133824666838504)
    expect(moderado.otros).toBe(0.005502304016167772)
  })

  it('cuadra en 1 para los cinco perfiles', () => {
    for (const perfil of benchmarks.perfiles) {
      const total = CLASES.reduce((acc, c) => acc + benchmarks.clases[c].pesos[perfil], 0)
      expect(total).toBeCloseTo(1, 6)
    }
  })

  it('renormaliza los pesos de producto dentro de su clase', () => {
    const fijo = pesosDeClase('fijo', 'Moderado')
    const total = Object.values(fijo).reduce((a, b) => a + b, 0)
    expect(total).toBeCloseTo(1, 12)
    // En la hoja el peso está sobre el patrimonio total; dentro de la clase,
    // el bono corporativo pesa ~30.6%, que es lo que espera la cascada.
    expect(fijo['iShares $ Corporate Bond UCITS ETF Acc']).toBeCloseTo(0.3065, 4)
  })

  it('devuelve un mapa vacío para una clase sin productos', () => {
    expect(pesosDeClase('cash', 'Moderado')).toStrictEqual({})
  })

  it('el perfil Arriesgado no asigna nada a fijo', () => {
    expect(benchmarkDe('Arriesgado').fijo).toBe(0)
  })
})

describe('validación del esquema', () => {
  const base = structuredClone(benchmarks) as unknown as Record<string, unknown>

  it('rechaza un benchmark que no suma 1', () => {
    const roto = structuredClone(base) as typeof benchmarks
    roto.clases.cash.pesos.Moderado += 0.05
    const r = benchmarksSchema.safeParse(roto)
    expect(r.success).toBe(false)
    expect(JSON.stringify(r.error?.issues)).toContain('deberian sumar 1')
  })

  it('rechaza un peso expresado como porcentaje', () => {
    const roto = structuredClone(base) as typeof benchmarks
    roto.clases.cash.pesos.Moderado = 9.47
    const r = benchmarksSchema.safeParse(roto)
    expect(r.success).toBe(false)
    expect(JSON.stringify(r.error?.issues)).toContain('de 0 a 1')
  })

  it('rechaza un producto que pesa más que su clase', () => {
    const roto = structuredClone(base) as typeof benchmarks
    roto.clases.fijo.productos[0]!.pesos.Moderado = 0.9
    const r = benchmarksSchema.safeParse(roto)
    expect(r.success).toBe(false)
    expect(JSON.stringify(r.error?.issues)).toContain('no puede pesar mas que su clase')
  })

  it('rechaza un peso negativo', () => {
    const roto = structuredClone(base) as typeof benchmarks
    roto.clases.cash.pesos.Moderado = -0.1
    expect(benchmarksSchema.safeParse(roto).success).toBe(false)
  })
})

describe('clase Otros', () => {
  it('parte Otros en BTC y Oro según la hoja Allocation detallado', () => {
    const otros = pesosDeClase('otros', 'Moderado')
    const total = Object.values(otros).reduce((a, b) => a + b, 0)
    expect(total).toBeCloseTo(1, 12)
    // Moderado: cripto 0.0046 y oro 0.000925 sobre el patrimonio.
    expect(otros['BTC (IBIT)']).toBeCloseTo(0.0046 / 0.005525, 4)
    expect(otros['Oro']).toBeCloseTo(0.000925 / 0.005525, 4)
  })

  it('los perfiles conservadores no llevan oro', () => {
    expect(pesosDeClase('otros', 'Conservador')['Oro'] ?? 0).toBe(0)
    expect(pesosDeClase('otros', 'Conservador & Moderado')['Oro'] ?? 0).toBe(0)
  })

  it('en Arriesgado el BTC domina la clase', () => {
    const otros = pesosDeClase('otros', 'Arriesgado')
    expect(otros['BTC (IBIT)']).toBeGreaterThan(0.9)
  })
})
