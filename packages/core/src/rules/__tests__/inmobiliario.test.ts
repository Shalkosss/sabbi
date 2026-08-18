import { describe, expect, it } from 'vitest'

import type { ClaseModelo, ResultadoReparto } from '../../domain/tipos.js'
import { prorratearInmobiliario, UMBRAL_INMOBILIARIO } from '../inmobiliario.js'

/** Reparto de juguete: objetivos redondos para que el prorrateo se lea a ojo. */
function repartoDe(
  objetivos: Partial<Record<ClaseModelo, number>>,
  pisos: Partial<Record<ClaseModelo, number>> = {},
): ResultadoReparto {
  const clases: ClaseModelo[] = ['fijo', 'variable', 'privados', 'inm', 'cash']
  return {
    porClase: clases.map((clase) => {
      const objetivoUsd = objetivos[clase] ?? 0
      const pisoUsd = pisos[clase] ?? 0
      return {
        clase,
        objetivoUsd,
        pisoUsd,
        dineroNuevoUsd: Math.max(0, objetivoUsd - pisoUsd),
        cerrada: pisoUsd > 0 && objetivoUsd <= pisoUsd,
      }
    }),
    baseRedistribucion: 0,
    iteraciones: 1,
  }
}

const objetivo = (r: ResultadoReparto, clase: ClaseModelo) =>
  r.porClase.find((c) => c.clase === clase)?.objetivoUsd ?? 0

const BASE = { inm: 100_000, fijo: 100_000, variable: 50_000, privados: 50_000, cash: 40_000 }

describe('prorratearInmobiliario', () => {
  describe('bajo el umbral', () => {
    const r = prorratearInmobiliario(repartoDe(BASE), { patrimonioTotalUsd: 340_000 })

    it('disuelve la clase inmobiliaria', () => {
      expect(objetivo(r, 'inm')).toBe(0)
    })

    it('reparte su capital entre fijo, variable y privados a prorrata', () => {
      // 100k sobre una base de 200k: cada una crece un 50%.
      expect(objetivo(r, 'fijo')).toBeCloseTo(150_000, 6)
      expect(objetivo(r, 'variable')).toBeCloseTo(75_000, 6)
      expect(objetivo(r, 'privados')).toBeCloseTo(75_000, 6)
    })

    it('no toca el cash', () => {
      expect(objetivo(r, 'cash')).toBe(40_000)
    })

    it('conserva el patrimonio total', () => {
      const total = r.porClase.reduce((acc, c) => acc + c.objetivoUsd, 0)
      expect(total).toBeCloseTo(340_000, 6)
    })

    it('recalcula el dinero nuevo de las receptoras', () => {
      const conPiso = prorratearInmobiliario(repartoDe(BASE, { fijo: 120_000 }), {
        patrimonioTotalUsd: 340_000,
      })
      const fijo = conPiso.porClase.find((c) => c.clase === 'fijo')
      expect(fijo?.dineroNuevoUsd).toBeCloseTo(30_000, 6)
      expect(fijo?.cerrada).toBe(false)
    })
  })

  describe('cuando no aplica', () => {
    it('deja el reparto intacto sobre el umbral', () => {
      const original = repartoDe(BASE)
      const r = prorratearInmobiliario(original, { patrimonioTotalUsd: UMBRAL_INMOBILIARIO })
      expect(r).toBe(original)
    })

    it('respeta el inmueble conservado, que llega como piso', () => {
      const r = prorratearInmobiliario(repartoDe(BASE, { inm: 100_000 }), {
        patrimonioTotalUsd: 340_000,
      })
      expect(objetivo(r, 'inm')).toBe(100_000)
    })

    it('respeta el escape manual del asesor', () => {
      const r = prorratearInmobiliario(repartoDe(BASE), {
        patrimonioTotalUsd: 340_000,
        inmFijado: true,
      })
      expect(objetivo(r, 'inm')).toBe(100_000)
    })

    it('no hace nada si la clase no tiene objetivo', () => {
      const r = prorratearInmobiliario(repartoDe({ ...BASE, inm: 0 }), {
        patrimonioTotalUsd: 240_000,
      })
      expect(objetivo(r, 'fijo')).toBe(100_000)
    })

    it('no hace nada si no hay clases receptoras', () => {
      const r = prorratearInmobiliario(repartoDe({ inm: 100_000, cash: 40_000 }), {
        patrimonioTotalUsd: 140_000,
      })
      expect(objetivo(r, 'inm')).toBe(100_000)
    })
  })
})
