import { describe, expect, it } from 'vitest'

import { crecimiento, matrizMensual, maximaCaida, mediana, resumirSerie } from '../serie.js'
import type { ObservacionMensual } from '../tipos.js'

/** Una serie corta y a mano: cada test dice que espera y por que. */
const serie = (...pares: readonly (readonly [string, number | null])[]): ObservacionMensual[] =>
  pares.map(([mes, retornoTotal]) => ({ mes, nav: null, retornoTotal }))

describe('crecimiento', () => {
  it('compone los retornos y arranca en 1 el mes anterior al primero', () => {
    const curva = crecimiento(serie(['2025-01', 0.1], ['2025-02', 0.1]))

    expect(curva).toHaveLength(3)
    expect(curva[0]).toMatchObject({ mes: '2024-12', indice: 1, retorno: null })
    expect(curva[1]!.indice).toBeCloseTo(1.1, 12)
    expect(curva[2]!.indice).toBeCloseTo(1.21, 12)
  })

  it('saltea el mes sin retorno en vez de tratarlo como cero', () => {
    const curva = crecimiento(serie(['2025-01', 0.1], ['2025-02', null], ['2025-03', 0.1]))

    // Tres puntos: el arranque y los dos meses con dato. El hueco no dibuja.
    expect(curva.map((p) => p.mes)).toEqual(['2024-12', '2025-01', '2025-03'])
    expect(curva.at(-1)!.indice).toBeCloseTo(1.21, 12)
  })

  it('el drawdown mide contra el maximo previo, no contra el arranque', () => {
    const curva = crecimiento(serie(['2025-01', 0.5], ['2025-02', -0.2]))

    expect(curva.at(-1)!.drawdown).toBeCloseTo(-0.2, 12)
  })

  it('una serie sin un solo retorno no tiene curva', () => {
    expect(crecimiento(serie(['2025-01', null]))).toEqual([])
  })

  it('ordena la serie antes de componer: el orden de carga no cambia el resultado', () => {
    const alReves = crecimiento(serie(['2025-03', 0.05], ['2025-01', 0.1], ['2025-02', -0.02]))
    const enOrden = crecimiento(serie(['2025-01', 0.1], ['2025-02', -0.02], ['2025-03', 0.05]))

    expect(alReves.at(-1)!.indice).toBeCloseTo(enOrden.at(-1)!.indice, 12)
  })
})

describe('maximaCaida', () => {
  it('encuentra el piso, el techo del que cayo y cuanto tardo en volver', () => {
    const caida = maximaCaida(
      serie(
        ['2025-01', 0.1], // techo
        ['2025-02', -0.1],
        ['2025-03', -0.05], // piso
        ['2025-04', 0.08],
        ['2025-05', 0.1], // recupera
      ),
    )

    expect(caida.desde).toBe('2025-01')
    expect(caida.mes).toBe('2025-03')
    expect(caida.profundidad).toBeCloseTo(0.9 * 0.95 - 1, 12)
    expect(caida.recuperoEn).toBe(2)
  })

  it('una serie que solo sube no tiene caida', () => {
    const caida = maximaCaida(serie(['2025-01', 0.01], ['2025-02', 0.02]))

    expect(caida.profundidad).toBe(0)
    expect(caida.mes).toBeNull()
  })

  it('deja la recuperacion en null mientras el fondo siga abajo', () => {
    const caida = maximaCaida(serie(['2025-01', 0.1], ['2025-02', -0.3], ['2025-03', 0.01]))

    expect(caida.mes).toBe('2025-02')
    expect(caida.recuperoEn).toBeNull()
  })
})

describe('resumirSerie', () => {
  const resumen = resumirSerie(
    serie(
      ['2025-01', 0.02],
      ['2025-02', -0.01],
      ['2025-04', 0.03], // marzo no se cargo
      ['2025-05', 0.01],
    ),
  )

  it('cuenta meses en verde y en rojo sobre los que tienen dato', () => {
    expect(resumen.meses).toBe(4)
    expect(resumen.positivos).toBe(3)
    expect(resumen.negativos).toBe(1)
    expect(resumen.aciertos).toBeCloseTo(0.75, 12)
  })

  it('informa el hueco de carga en vez de esconderlo', () => {
    // Cinco meses entre enero y mayo, cuatro cargados.
    expect(resumen.huecos).toBe(1)
  })

  it('el mejor y el peor mes vienen con su fecha', () => {
    expect(resumen.mejor).toEqual({ mes: '2025-04', retorno: 0.03 })
    expect(resumen.peor).toEqual({ mes: '2025-02', retorno: -0.01 })
  })

  it('la racha se cuenta desde el cierre hacia atras', () => {
    expect(resumen.rachaActual).toBe(2)
  })

  it('un mes plano corta la racha: cero no es verde', () => {
    expect(resumirSerie(serie(['2025-01', 0.01], ['2025-02', 0])).rachaActual).toBe(0)
  })

  it('una serie vacia no inventa un cero', () => {
    const nada = resumirSerie(serie(['2025-01', null]))

    expect(nada.meses).toBe(0)
    expect(nada.aciertos).toBeNull()
    expect(nada.mejor).toBeNull()
  })
})

describe('matrizMensual', () => {
  const series = new Map([
    ['1', serie(['2025-01', 0.01], ['2025-03', 0.02])],
    ['2', serie(['2025-01', 0.03], ['2025-02', -0.01])],
  ])

  const filas = matrizMensual(series, '2025-01', '2025-03')

  it('trae todos los meses del rango, tambien los que nadie cargo', () => {
    expect(filas.map((f) => f.mes)).toEqual(['2025-01', '2025-02', '2025-03'])
  })

  it('un fondo sin dato en un mes no aparece en esa fila', () => {
    expect(filas[1]!.retornos.has('1')).toBe(false)
    expect(filas[1]!.cargados).toBe(1)
  })

  it('la mediana del mes describe al mes, no al fondo mas ruidoso', () => {
    expect(filas[0]!.mediana).toBeCloseTo(0.02, 12)
    expect(filas[1]!.mediana).toBeCloseTo(-0.01, 12)
  })

  it('un mes sin una sola carga no publica mediana', () => {
    const vacio = matrizMensual(new Map(), '2025-01', '2025-01')

    expect(vacio[0]!.cargados).toBe(0)
    expect(vacio[0]!.mediana).toBeNull()
  })
})

describe('mediana', () => {
  it('con cantidad impar toma el del medio', () => {
    expect(mediana([3, 1, 2])).toBe(2)
  })

  it('con cantidad par promedia los dos del medio', () => {
    expect(mediana([1, 2, 3, 4])).toBe(2.5)
  })

  it('sin valores no hay mediana', () => {
    expect(mediana([])).toBeNull()
  })
})
