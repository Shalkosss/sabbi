import { describe, expect, it } from 'vitest'

import {
  dispersionRiesgoRetorno,
  extremosPorClase,
  rankear,
  resumenPorClase,
} from '../insights.js'
import { calcularMetricas } from '../metricas.js'
import type { FichaFondo, MetricasFondo, ObservacionMensual } from '../tipos.js'

const PARAMETROS = { riskFree: 0.04, anioTope: 2025, aniosAtras: 3 }

/** Un fondo con doce meses de retorno constante: retorno conocido, desviacion cero. */
const constante = (id: string, assetClass: string, mensual: number): MetricasFondo => {
  const ficha: FichaFondo = {
    id,
    nombre: id.toUpperCase(),
    assetClass,
    inception: '2024-12',
    guidanceCortoPlazo: null,
    domicilio: null,
    esReferencia: false,
  }
  const serie: ObservacionMensual[] = [...Array(12).keys()].map((i) => ({
    mes: `2025-${String(i + 1).padStart(2, '0')}`,
    nav: null,
    retornoTotal: mensual,
  }))
  return calcularMetricas(ficha, serie, PARAMETROS)
}

/** Retornos alternados: mismo acumulado aproximado, pero con volatilidad real. */
const volatil = (id: string, assetClass: string, alto: number, bajo: number): MetricasFondo => {
  const ficha: FichaFondo = {
    id,
    nombre: id.toUpperCase(),
    assetClass,
    inception: '2024-12',
    guidanceCortoPlazo: null,
    domicilio: null,
    esReferencia: false,
  }
  const serie: ObservacionMensual[] = [...Array(12).keys()].map((i) => ({
    mes: `2025-${String(i + 1).padStart(2, '0')}`,
    nav: null,
    retornoTotal: i % 2 === 0 ? alto : bajo,
  }))
  return calcularMetricas(ficha, serie, PARAMETROS)
}

/** Un fondo corto: tres meses, no llega a ninguna ventana de riesgo. */
const corto = (id: string, assetClass: string): MetricasFondo => {
  const ficha: FichaFondo = {
    id,
    nombre: id.toUpperCase(),
    assetClass,
    inception: '2025-09',
    guidanceCortoPlazo: null,
    domicilio: null,
    esReferencia: false,
  }
  const serie: ObservacionMensual[] = ['2025-10', '2025-11', '2025-12'].map((mes) => ({
    mes,
    nav: null,
    retornoTotal: 0.05,
  }))
  return calcularMetricas(ficha, serie, PARAMETROS)
}

describe('rankear', () => {
  const fondos = [
    constante('lento', 'Private Debt', 0.002),
    constante('rapido', 'Private Debt', 0.01),
    constante('medio', 'Private Debt', 0.005),
  ]

  it('ordena de mejor a peor y numera los puestos desde uno', () => {
    const ranking = rankear(fondos, '1y', 'retorno')

    expect(ranking.puestos.map((p) => p.fondoId)).toEqual(['rapido', 'medio', 'lento'])
    expect(ranking.puestos.map((p) => p.puesto)).toEqual([1, 2, 3])
  })

  it('con sentido ascendente el puesto uno es el mas bajo', () => {
    const ranking = rankear(fondos, '1y', 'retorno', false)
    expect(ranking.puestos[0]!.fondoId).toBe('lento')
  })

  it('un fondo sin dato no rompe el ranking: queda contado aparte', () => {
    const ranking = rankear([...fondos, corto('nuevo', 'Private Debt')], '1y', 'retorno')

    expect(ranking.puestos).toHaveLength(3)
    expect(ranking.sinDato).toBe(1)
    expect(ranking.puestos.some((p) => p.fondoId === 'nuevo')).toBe(false)
  })

  it('sin ningun fondo con dato el ranking queda vacio, no a cero', () => {
    const ranking = rankear([corto('a', 'HF'), corto('b', 'HF')], '1y', 'sharpe')

    expect(ranking.puestos).toEqual([])
    expect(ranking.sinDato).toBe(2)
  })
})

describe('extremosPorClase', () => {
  const fondos = [
    constante('pd-bueno', 'Private Debt', 0.01),
    constante('pd-malo', 'Private Debt', 0.001),
    volatil('hf-volatil', 'Hedge Funds', 0.05, -0.03),
    // Rinde menos, pero casi sin dispersion. Con desviacion exactamente cero no
    // habria Sharpe con que compararlo — ver `DESVIACION_MINIMA`.
    volatil('hf-plano', 'Hedge Funds', 0.005, 0.003),
  ]

  it('compara adentro de cada clase, no entre clases', () => {
    const clases = extremosPorClase(fondos, '1y')
    const pd = clases.find((c) => c.assetClass === 'Private Debt')!
    const hf = clases.find((c) => c.assetClass === 'Hedge Funds')!

    expect(pd.mejorRetorno!.fondoId).toBe('pd-bueno')
    expect(pd.peorRetorno!.fondoId).toBe('pd-malo')
    expect(hf.mayorDesviacion!.fondoId).toBe('hf-volatil')
  })

  it('el mejor Sharpe no es siempre el de mejor retorno', () => {
    const hf = extremosPorClase(fondos, '1y').find((c) => c.assetClass === 'Hedge Funds')!

    // El volatil rinde mas, pero paga toda su prima en desviacion.
    expect(hf.mejorRetorno!.fondoId).toBe('hf-volatil')
    expect(hf.mejorSharpe!.fondoId).toBe('hf-plano')
  })

  it('con un solo fondo no hay peor: seria el mismo que el mejor', () => {
    const clases = extremosPorClase([constante('solo', 'Infra', 0.006)], '1y')

    expect(clases[0]!.mejorRetorno!.fondoId).toBe('solo')
    expect(clases[0]!.peorRetorno).toBeNull()
  })

  it('una clase entera sin historia no desaparece de la lista', () => {
    const clases = extremosPorClase([...fondos, corto('vc-nuevo', 'VC')], '1y')
    const vc = clases.find((c) => c.assetClass === 'VC')!

    expect(vc.total).toBe(1)
    expect(vc.conDato).toBe(0)
    expect(vc.mejorRetorno).toBeNull()
  })

  it('las clases salen ordenadas alfabeticamente', () => {
    const clases = extremosPorClase(fondos, '1y')
    expect(clases.map((c) => c.assetClass)).toEqual(['Hedge Funds', 'Private Debt'])
  })
})

describe('dispersionRiesgoRetorno', () => {
  it('deja afuera al fondo sin las dos coordenadas', () => {
    const puntos = dispersionRiesgoRetorno(
      [constante('a', 'PD', 0.01), corto('b', 'PD')],
      '1y',
    )

    expect(puntos.map((p) => p.fondoId)).toEqual(['a'])
  })

  it('cada punto trae su clase, para colorear sin volver a buscarla', () => {
    const puntos = dispersionRiesgoRetorno([volatil('v', 'Hedge Funds', 0.04, -0.02)], '1y')

    expect(puntos[0]!.assetClass).toBe('Hedge Funds')
    expect(puntos[0]!.desviacion).toBeGreaterThan(0)
  })
})

describe('resumenPorClase', () => {
  const fondos = [
    constante('a', 'Private Debt', 0.01),
    constante('b', 'Private Debt', 0.002),
    constante('c', 'Infra', 0.005),
  ]

  it('promedia solo los que tienen dato y dice cuantos son', () => {
    const pd = resumenPorClase([...fondos, corto('d', 'Private Debt')], '1y').find(
      (c) => c.assetClass === 'Private Debt',
    )!

    expect(pd.fondos).toBe(3)
    expect(pd.conDato).toBe(2)

    const esperado = ((1.01 ** 12 - 1) + (1.002 ** 12 - 1)) / 2
    expect(pd.retornoPromedio).toBeCloseTo(esperado, 12)
  })

  it('la dispersion es la distancia entre el mejor y el peor', () => {
    const pd = resumenPorClase(fondos, '1y').find((c) => c.assetClass === 'Private Debt')!
    expect(pd.dispersion).toBeCloseTo((1.01 ** 12 - 1) - (1.002 ** 12 - 1), 12)
  })

  it('con un solo fondo no hay dispersion que medir', () => {
    const infra = resumenPorClase(fondos, '1y').find((c) => c.assetClass === 'Infra')!
    expect(infra.dispersion).toBeNull()
  })

  it('una clase sin dato promedia null, nunca cero', () => {
    const vc = resumenPorClase([corto('x', 'VC')], '1y')[0]!

    expect(vc.retornoPromedio).toBeNull()
    expect(vc.sharpePromedio).toBeNull()
    expect(vc.dispersion).toBeNull()
  })
})

/**
 * Los indices de referencia no compiten.
 *
 * En la hoja `Ranking Fondos` competian: el S&P 500 ocupaba una columna igual
 * a la de un fondo y el `LARGE()` lo ordenaba con el resto. Un indice que gana
 * el ranking de Private Equity manda a la mesa a recomendar algo que no esta a
 * la venta.
 */
describe('los indices de referencia quedan fuera de los comparativos', () => {
  const referencia = (id: string, assetClass: string, mensual: number): MetricasFondo => {
    const base = constante(id, assetClass, mensual)
    return { ...base, fondo: { ...base.fondo, esReferencia: true } }
  }

  // El indice rinde mas que cualquiera de los dos fondos de la clase.
  const universo = [
    constante('a', 'Private Equity', 0.01),
    constante('b', 'Private Equity', 0.008),
    referencia('ivv', 'Private Equity', 0.03),
  ]

  it('el ranking no los lista, ni siquiera ultimos', () => {
    const ranking = rankear(universo, '1y', 'retorno')
    expect(ranking.puestos.map((p) => p.fondoId)).toEqual(['a', 'b'])
  })

  it('no ganan el mejor retorno de su clase', () => {
    const extremos = extremosPorClase(universo, '1y')
    const pe = extremos.find((e) => e.assetClass === 'Private Equity')!
    expect(pe.mejorRetorno?.fondoId).toBe('a')
    expect(pe.total).toBe(2)
  })

  it('no arrastran el promedio de la clase', () => {
    const resumen = resumenPorClase(universo, '1y')
    const pe = resumen.find((r) => r.assetClass === 'Private Equity')!
    expect(pe.fondos).toBe(2)
    const soloFondos = resumenPorClase(universo.slice(0, 2), '1y')[0]!
    expect(pe.retornoPromedio).toBeCloseTo(soloFondos.retornoPromedio!, 12)
  })

  it('el dispersion si los muestra, marcados: ahi la referencia es el punto', () => {
    const puntos = dispersionRiesgoRetorno(universo, '1y')
    expect(puntos.map((p) => p.fondoId).sort()).toEqual(['a', 'b', 'ivv'])
    expect(puntos.find((p) => p.fondoId === 'ivv')?.esReferencia).toBe(true)
    expect(puntos.find((p) => p.fondoId === 'a')?.esReferencia).toBe(false)
  })
})
