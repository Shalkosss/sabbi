import { describe, expect, it } from 'vitest'

import type { ObservacionMensual } from '../../retornos/tipos.js'
import {
  armar,
  correrEscenarios,
  curva,
  medir,
  mezclar,
  recortar,
  serieDelPortafolio,
  ventanaComun,
} from '../portafolio.js'
import type { Reparto, SeriesPorClase } from '../tipos.js'

/** Un reparto escrito como se lee. */
const reparto = (pesos: Record<string, number>): Reparto => new Map(Object.entries(pesos))

/** Una serie mensual a partir de un mes de arranque y sus retornos. */
function serie(desde: string, retornos: readonly number[]): readonly ObservacionMensual[] {
  const [anio, mes] = desde.split('-').map(Number) as [number, number]

  return retornos.map((retornoTotal, i) => {
    const corrido = mes - 1 + i
    const y = anio + Math.floor(corrido / 12)
    const m = (corrido % 12) + 1
    return { mes: `${y}-${String(m).padStart(2, '0')}`, nav: null, retornoTotal }
  })
}

const CLASICO = reparto({ rv: 0.6, rf: 0.4 })

describe('mezclar', () => {
  it('reparte el sleeve y deja a las publicas en su proporcion', () => {
    const salida = mezclar(CLASICO, reparto({ pc: 0.5, pe: 0.5 }), 0.2)

    // El 60/40 pierde 20 puntos y queda 48/32: la relacion 60:40 se conserva.
    expect(salida.get('rv')).toBeCloseTo(0.48, 12)
    expect(salida.get('rf')).toBeCloseTo(0.32, 12)
    expect(salida.get('pc')).toBeCloseTo(0.1, 12)
    expect(salida.get('pe')).toBeCloseTo(0.1, 12)
  })

  it('la torta siempre cierra en uno', () => {
    for (const asignacion of [0, 0.1, 0.25, 0.5, 1]) {
      const salida = mezclar(CLASICO, reparto({ pc: 0.4, pe: 0.35, re: 0.25 }), asignacion)
      const total = [...salida.values()].reduce((s, p) => s + p, 0)
      expect(total).toBeCloseTo(1, 12)
    }
  })

  it('normaliza una mezcla que la mesa dejo sin sumar uno', () => {
    const salida = mezclar(CLASICO, reparto({ pc: 0.3, pe: 0.3 }), 0.2)

    expect(salida.get('pc')).toBeCloseTo(0.1, 12)
    expect(salida.get('pe')).toBeCloseTo(0.1, 12)
  })

  it('sin asignacion devuelve el clasico y ninguna clase alternativa', () => {
    const salida = mezclar(CLASICO, reparto({ pc: 1 }), 0)

    expect(salida.get('rv')).toBeCloseTo(0.6, 12)
    expect(salida.has('pc')).toBe(false)
  })

  it('una clase en cero no queda como porcion de la torta', () => {
    const salida = mezclar(reparto({ rv: 1, rf: 0 }), reparto({ pc: 1 }), 0.2)

    expect(salida.has('rf')).toBe(false)
    expect(salida.get('rv')).toBeCloseTo(0.8, 12)
  })
})

describe('ventanaComun', () => {
  const series: SeriesPorClase = new Map([
    ['rv', serie('2020-01', [0.01, 0.01, 0.01, 0.01])],
    ['rf', serie('2020-03', [0.005, 0.005])],
  ])

  it('arranca donde arranca la serie mas corta y termina donde termina la primera', () => {
    expect(ventanaComun(CLASICO, series)).toEqual({ desde: '2020-03', hasta: '2020-04' })
  })

  it('una clase con peso y sin serie no tiene ventana', () => {
    expect(ventanaComun(reparto({ rv: 0.5, sinserie: 0.5 }), series)).toBeNull()
  })

  it('una clase en cero no acorta la ventana', () => {
    const salida = ventanaComun(reparto({ rv: 1, sinserie: 0 }), series)

    expect(salida).toEqual({ desde: '2020-01', hasta: '2020-04' })
  })

  it('dos series que no se solapan no forman un portafolio', () => {
    const sueltas: SeriesPorClase = new Map([
      ['rv', serie('2019-01', [0.01, 0.01])],
      ['rf', serie('2021-01', [0.01, 0.01])],
    ])

    expect(ventanaComun(CLASICO, sueltas)).toBeNull()
  })
})

describe('serieDelPortafolio', () => {
  it('es el promedio ponderado mes a mes', () => {
    const series: SeriesPorClase = new Map([
      ['rv', serie('2020-01', [0.1, -0.05])],
      ['rf', serie('2020-01', [0.02, 0.01])],
    ])

    const salida = serieDelPortafolio(CLASICO, series)

    expect(salida.map((o) => o.mes)).toEqual(['2020-01', '2020-02'])
    expect(salida[0]!.retornoTotal).toBeCloseTo(0.6 * 0.1 + 0.4 * 0.02, 12)
    expect(salida[1]!.retornoTotal).toBeCloseTo(0.6 * -0.05 + 0.4 * 0.01, 12)
  })

  it('saltea el mes al que le falta una clase, no lo cuenta como cero', () => {
    const series: SeriesPorClase = new Map([
      ['rv', serie('2020-01', [0.1, 0.1, 0.1])],
      [
        'rf',
        [
          { mes: '2020-01', nav: null, retornoTotal: 0.01 },
          { mes: '2020-02', nav: null, retornoTotal: null },
          { mes: '2020-03', nav: null, retornoTotal: 0.01 },
        ],
      ],
    ])

    const salida = serieDelPortafolio(CLASICO, series)

    expect(salida.map((o) => o.mes)).toEqual(['2020-01', '2020-03'])
  })

  it('una clase con peso y sin serie deja el portafolio sin serie', () => {
    const series: SeriesPorClase = new Map([['rv', serie('2020-01', [0.1])]])

    expect(serieDelPortafolio(CLASICO, series)).toEqual([])
  })
})

describe('medir', () => {
  const doceMeses = serie('2020-01', Array<number>(12).fill(0.01))
  const series: SeriesPorClase = new Map([
    ['rv', doceMeses],
    ['rf', doceMeses],
  ])

  it('compone el acumulado y no anualiza una ventana de un anio', () => {
    const salida = medir(armar('teorico', CLASICO, series), series)

    expect(salida.meses).toBe(12)
    expect(salida.acumulado).toBeCloseTo(1.01 ** 12 - 1, 12)
    // A los doce meses justos el acumulado ya es la tasa anual.
    expect(salida.anualizado).toBeCloseTo(salida.acumulado!, 12)
  })

  it('una serie constante no tiene volatilidad ni caida', () => {
    const salida = medir(armar('teorico', CLASICO, series), series)

    expect(salida.volatilidad).toBeCloseTo(0, 12)
    expect(salida.maximaCaida).toBe(0)
  })

  it('mide la caida contra el maximo previo', () => {
    const conCaida = serie('2020-01', [0.1, -0.2, 0.05])
    const suyas: SeriesPorClase = new Map([
      ['rv', conCaida],
      ['rf', conCaida],
    ])

    const salida = medir(armar('teorico', CLASICO, suyas), suyas)

    expect(salida.maximaCaida).toBeCloseTo(-0.2, 12)
    expect(salida.caidaDesde).toBe('2020-01')
    expect(salida.caidaHasta).toBe('2020-02')
  })

  it('un portafolio con una clase sin serie no publica ninguna cifra', () => {
    const portafolio = armar('roto', reparto({ rv: 0.6, sinserie: 0.4 }), series)

    expect(portafolio.faltan).toEqual(['sinserie'])
    expect(medir(portafolio, series)).toMatchObject({
      acumulado: null,
      anualizado: null,
      volatilidad: null,
      maximaCaida: null,
      meses: 0,
    })
  })

  it('anualiza por debajo del acumulado cuando la ventana pasa el anio', () => {
    const dosAnios = serie('2020-01', Array<number>(24).fill(0.01))
    const suyas: SeriesPorClase = new Map([
      ['rv', dosAnios],
      ['rf', dosAnios],
    ])

    const salida = medir(armar('teorico', CLASICO, suyas), suyas)

    expect(salida.acumulado).toBeCloseTo(1.01 ** 24 - 1, 12)
    expect(salida.anualizado).toBeCloseTo(1.01 ** 12 - 1, 12)
  })
})

describe('recortar', () => {
  const series: SeriesPorClase = new Map([
    ['rv', serie('2019-01', Array<number>(36).fill(0.01))],
    ['pc', serie('2021-01', Array<number>(12).fill(0.01))],
  ])

  it('deja a los dos portafolios midiendo los mismos meses', () => {
    const conAlts = mezclar(reparto({ rv: 1 }), reparto({ pc: 1 }), 0.2)
    const ventana = ventanaComun(conAlts, series)!
    const recortadas = recortar(series, ventana.desde, ventana.hasta)

    const clasico = medir(armar('clasico', reparto({ rv: 1 }), recortadas), recortadas)
    const alterno = medir(armar('con alts', conAlts, recortadas), recortadas)

    expect(clasico.desde).toBe(alterno.desde)
    expect(clasico.hasta).toBe(alterno.hasta)
    expect(clasico.meses).toBe(alterno.meses)
  })

  it('sin recortar, el clasico mide una epoca que el otro no vivio', () => {
    const clasico = medir(armar('clasico', reparto({ rv: 1 }), series), series)

    expect(clasico.meses).toBe(36)
    expect(clasico.desde).toBe('2019-01')
  })
})

describe('curva', () => {
  it('arranca en el monto y compone desde ahi', () => {
    const suya = serie('2020-01', [0.1, 0.1])
    const series: SeriesPorClase = new Map([
      ['rv', suya],
      ['rf', suya],
    ])

    const puntos = curva(armar('teorico', CLASICO, series), series, 100_000)

    expect(puntos[0]).toEqual({ mes: '2019-12', valor: 100_000 })
    expect(puntos[2]!.valor).toBeCloseTo(121_000, 6)
  })
})

describe('correrEscenarios', () => {
  const suya = serie('2020-01', [0.1, -0.1, 0.05])
  const series: SeriesPorClase = new Map([
    ['rv', suya],
    ['rf', suya],
  ])
  const portafolio = armar('teorico', CLASICO, series)

  it('compone los meses de la ventana', () => {
    const [salida] = correrEscenarios(portafolio, series, [
      { nombre: 'los dos primeros', desde: '2020-01', hasta: '2020-02' },
    ])

    expect(salida!.retorno).toBeCloseTo(1.1 * 0.9 - 1, 12)
    expect(salida!.fueraDeSerie).toBe(false)
  })

  it('no contesta por media ventana', () => {
    const [salida] = correrEscenarios(portafolio, series, [
      { nombre: 'arranca antes de la serie', desde: '2019-06', hasta: '2020-02' },
    ])

    expect(salida!.retorno).toBeNull()
    expect(salida!.fueraDeSerie).toBe(true)
  })
})
