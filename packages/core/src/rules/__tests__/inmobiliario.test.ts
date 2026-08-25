import { describe, expect, it } from 'vitest'

import type { ClaseModelo, ResultadoReparto } from '../../domain/tipos.js'
import { prorratearInmobiliario, UMBRAL_INMOBILIARIO } from '../inmobiliario.js'

/** Reparto de juguete: objetivos redondos para que el prorrateo se lea a ojo. */
function repartoDe(
  objetivos: Partial<Record<ClaseModelo, number>>,
  pisos: Partial<Record<ClaseModelo, number>> = {},
  fijadas: readonly ClaseModelo[] = [],
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
        fijada: fijadas.includes(clase),
      }
    }),
    baseRedistribucion: 0,
    iteraciones: 1,
    ajustes: [],
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

describe('las dos maneras de repartir el inmobiliario disuelto', () => {
  /**
   * La mesa venia trabajando con dos hojas que no coinciden, y difieren en
   * esto: el capital de la clase disuelta se prorratea entre las cinco
   * receptoras —la macro v8— o pasa entero al bloque de Privados, Club y
   * Otros. Las dos reparten el mismo dinero y las dos dejan al cash afuera.
   */
  const BASE = { inm: 100_000, fijo: 100_000, variable: 50_000, privados: 50_000, cash: 40_000 }
  const bajo = { patrimonioTotalUsd: 340_000 }

  const prorrateado = prorratearInmobiliario(repartoDe(BASE), { ...bajo, regla: 'prorratear' })
  const alBloque = prorratearInmobiliario(repartoDe(BASE), { ...bajo, regla: 'alternativos' })

  it('las dos disuelven la clase', () => {
    expect(objetivo(prorrateado, 'inm')).toBe(0)
    expect(objetivo(alBloque, 'inm')).toBe(0)
  })

  it('prorratear reparte entre todas las receptoras', () => {
    expect(objetivo(prorrateado, 'fijo')).toBeCloseTo(150_000, 2)
    expect(objetivo(prorrateado, 'variable')).toBeCloseTo(75_000, 2)
    expect(objetivo(prorrateado, 'privados')).toBeCloseTo(75_000, 2)
  })

  it('al bloque alternativo deja Fijo y Variable donde estaban', () => {
    expect(objetivo(alBloque, 'fijo')).toBeCloseTo(100_000, 2)
    expect(objetivo(alBloque, 'variable')).toBeCloseTo(50_000, 2)
    expect(objetivo(alBloque, 'privados')).toBeCloseTo(150_000, 2)
  })

  it('las dos dejan el cash afuera y cuadran contra el mismo total', () => {
    for (const r of [prorrateado, alBloque]) {
      expect(objetivo(r, 'cash')).toBeCloseTo(40_000, 2)
      expect(r.porClase.reduce((acc, c) => acc + c.objetivoUsd, 0)).toBeCloseTo(340_000, 2)
    }
  })

  it('el umbral se puede mover: sobre el, la clase no se disuelve', () => {
    const conUmbralBajo = prorratearInmobiliario(repartoDe(BASE), {
      ...bajo,
      umbralUsd: 300_000,
    })
    expect(objetivo(conUmbralBajo, 'inm')).toBeCloseTo(100_000, 2)
  })

  describe('a mercados publicos, la regla de la v4', () => {
    const aPublicos = prorratearInmobiliario(repartoDe(BASE), { ...bajo, regla: 'publicos' })

    it('solo reciben Renta Fija y Renta Variable', () => {
      // 100,000 repartidos entre 100,000 de Fijo y 50,000 de Variable: dos
      // tercios y un tercio.
      expect(objetivo(aPublicos, 'fijo')).toBeCloseTo(100_000 * (250 / 150), 2)
      expect(objetivo(aPublicos, 'variable')).toBeCloseTo(50_000 * (250 / 150), 2)
      expect(objetivo(aPublicos, 'privados')).toBeCloseTo(50_000, 2)
      expect(objetivo(aPublicos, 'inm')).toBe(0)
    })

    it('el cash sigue afuera y el total cuadra', () => {
      expect(objetivo(aPublicos, 'cash')).toBeCloseTo(40_000, 2)
      expect(aPublicos.porClase.reduce((acc, c) => acc + c.objetivoUsd, 0)).toBeCloseTo(340_000, 2)
    })

    it('sin mercados publicos cae al bloque alternativo en vez de perderse', () => {
      // Un perfil que no tiene ni Fijo ni Variable dejaria a `publicos` sin a
      // quien darle. El dinero no puede desaparecer: va a privados.
      const sinPublicos = prorratearInmobiliario(
        repartoDe({ inm: 100_000, privados: 50_000, cash: 40_000 }),
        { patrimonioTotalUsd: 190_000, regla: 'publicos' },
      )

      expect(objetivo(sinPublicos, 'inm')).toBe(0)
      expect(objetivo(sinPublicos, 'privados')).toBeCloseTo(150_000, 2)
      expect(objetivo(sinPublicos, 'cash')).toBeCloseTo(40_000, 2)
    })
  })
})
