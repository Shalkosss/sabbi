import { describe, expect, it } from 'vitest'

import { benchmarkDe, benchmarks, benchmarksSchema, CLASES, pesosDeClase } from '../index.js'

describe('configuración de benchmarks', () => {
  it('carga y valida el archivo extraído de la hoja Data', () => {
    expect(benchmarks.version).toBe(3)
    expect(benchmarks.hoja).toBe('Data')
    expect(benchmarks.perfiles).toHaveLength(5)
  })

  it('conserva la precisión completa que el JSON v2 había perdido', () => {
    const moderado = benchmarkDe('Moderado')
    // Estos son los pesos que reproducen la propuesta de Ana Tumi al centavo.
    // El JSON v2 traía 0.2406 / 0.1898 / 0.1642 / 0.3052 / 0.1002.
    expect(moderado.inm).toBe(0.24030062266972713)
    expect(moderado.fijo).toBe(0.18987950950338972)
    expect(moderado.variable).toBe(0.1642687853554088)
    expect(moderado.privados).toBe(0.31081141150218566)
    expect(moderado.cash).toBe(0.09473967096928874)
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
