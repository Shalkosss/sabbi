import { describe, expect, it } from 'vitest'

import type { Benchmark, Piso } from '../../domain/tipos.js'
import { generarPlan } from '../../plan.js'
import type { DatosProducto, PosicionPropuesta } from '../tipos.js'
import { armarComparativa, armarVistaHoy, SUBCLASE_SIN_DATO } from '../vistas.js'

const BENCHMARK: Benchmark = {
  fijo: 0.3,
  variable: 0.25,
  privados: 0.1,
  club: 0.1,
  otros: 0.05,
  inm: 0.1,
  cash: 0.1,
}

function posicion(parcial: Partial<PosicionPropuesta> & { valorUsd: number }): PosicionPropuesta {
  return {
    orden: 1,
    institucionProducto: 'Posición',
    origen: 'financiero',
    tipoFicha: null,
    assetClass: 'Money Market',
    claseModelo: 'cash',
    productoId: null,
    moneda: 'USD',
    plaza: 'Perú',
    rendimientoEst: 0.04,
    nota: '',
    pais: null,
    pctPertenencia: 1,
    valorDeclaradoUsd: parcial.valorUsd,
    uso: null,
    esInvertible: true,
    cta: 'conservar',
    montoVentaParcial: 0,
    ...parcial,
  }
}

describe('armarVistaHoy', () => {
  const posiciones = [
    posicion({ institucionProducto: 'DPF', valorUsd: 300_000, rendimientoEst: 0.05 }),
    posicion({
      institucionProducto: 'Cuenta corriente',
      valorUsd: 100_000,
      rendimientoEst: 0.01,
    }),
    posicion({
      institucionProducto: 'Bono corporativo',
      claseModelo: 'fijo',
      assetClass: 'Bonos Públicos',
      valorUsd: 200_000,
      rendimientoEst: 0.06,
    }),
    posicion({
      institucionProducto: 'Casa de playa',
      origen: 'inmueble',
      claseModelo: 'inm',
      assetClass: null,
      valorUsd: 400_000,
      rendimientoEst: null,
      uso: 'Renta',
    }),
  ]

  const vista = armarVistaHoy(posiciones)

  it('agrupa por clase con el share sobre el total', () => {
    expect(vista.totalUsd).toBe(1_000_000)
    const cash = vista.filas.find((f) => f.clase === 'cash')
    expect(cash?.usd).toBe(400_000)
    expect(cash?.share).toBeCloseTo(0.4, 10)
  })

  it('abre cada clase en sus subclases', () => {
    const cash = vista.filas.find((f) => f.clase === 'cash')
    expect(cash?.subfilas.map((s) => s.etiqueta)).toStrictEqual(['Money Market'])
    const inm = vista.filas.find((f) => f.clase === 'inm')
    expect(inm?.subfilas[0]?.etiqueta).toBe(SUBCLASE_SIN_DATO)
  })

  it('pondera la rentabilidad por clase sobre lo que tiene dato', () => {
    const cash = vista.filas.find((f) => f.clase === 'cash')
    // 300k al 5% y 100k al 1%: 4% ponderado, con dato completo.
    expect(cash?.rentabilidad?.rango.min).toBeCloseTo(0.04, 10)
    expect(cash?.rentabilidad?.cobertura).toBe(1)
  })

  it('la rentabilidad total solo pondera el dinero con dato y lo dice', () => {
    // El inmueble (400k) no tiene rendimiento: cobertura 60%.
    expect(vista.rentabilidad?.cobertura).toBeCloseTo(0.6, 10)
    // (300k×5% + 100k×1% + 200k×6%) / 600k = 4.667%.
    expect(vista.rentabilidad?.rango.min).toBeCloseTo(0.04666667, 6)
  })

  it('sin ningun dato, la rentabilidad no se afirma', () => {
    const vacia = armarVistaHoy([posicion({ valorUsd: 100_000, rendimientoEst: null })])
    expect(vacia.rentabilidad).toBeNull()
    expect(vacia.rentaAnualUsd).toBeNull()
  })

  it('la renta anual es la banda por el total', () => {
    expect(vista.rentaAnualUsd?.min).toBeCloseTo(0.04666667 * 1_000_000, 0)
  })
})

describe('armarComparativa', () => {
  const posiciones = [
    posicion({ institucionProducto: 'DPF viejo', valorUsd: 500_000, rendimientoEst: 0.03, cta: 'venta_total' }),
    posicion({
      institucionProducto: 'Acciones sueltas',
      claseModelo: 'variable',
      assetClass: 'Acciones Públicas',
      valorUsd: 500_000,
      rendimientoEst: 0.08,
      cta: 'venta_total',
    }),
  ]

  const plan = generarPlan({
    perfil: 'Moderado',
    patrimonioTotalUsd: 1_000_000,
    benchmark: BENCHMARK,
    pesos: {
      fijo: { 'ETF Bonos': 1 },
      variable: { 'iShares Core S&P 500': 1 },
      otros: { 'BTC (IBIT)': 0.85, Oro: 0.15 },
    },
    pisos: [] as Piso[],
    ticketMinimoUsd: 20_000,
    fallbacks: { fijo: 'Flip Panda', variable: 'Flip Cobra' },
  })

  const catalogo: ReadonlyMap<string, DatosProducto> = new Map([
    [
      'ETF Bonos',
      { retMin: 0.04, retMax: 0.05, distMin: null, distMax: null, distFrecuencia: null, moneda: 'USD' },
    ],
    [
      'iShares Core S&P 500',
      { retMin: 0.07, retMax: 0.1, distMin: null, distMax: null, distFrecuencia: null, moneda: 'USD' },
    ],
  ])

  const comparativa = armarComparativa(posiciones, plan, catalogo)

  it('pone el antes y el despues de cada clase lado a lado', () => {
    const variable = comparativa.filas.find((f) => f.clase === 'variable')
    expect(variable?.antesShare).toBeCloseTo(0.5, 10)
    expect(variable?.despuesShare).toBeCloseTo(0.25, 2)
    expect(variable?.deltaPp).toBeCloseTo(-25, 0)
  })

  it('una clase que solo existe en un lado tambien aparece', () => {
    const club = comparativa.filas.find((f) => f.clase === 'club')
    expect(club?.antesUsd).toBe(0)
    expect(club?.despuesUsd).toBeGreaterThan(0)
  })

  it('el despues abre en los instrumentos del plan', () => {
    const variable = comparativa.filas.find((f) => f.clase === 'variable')
    expect(variable?.despuesSub.map((s) => s.etiqueta)).toContain('iShares Core S&P 500')
  })

  it('la rentabilidad del despues sale del catalogo, ponderada', () => {
    const variable = comparativa.filas.find((f) => f.clase === 'variable')
    expect(variable?.rentabilidadDespues?.rango.min).toBeCloseTo(0.07, 10)
    expect(variable?.rentabilidadDespues?.rango.max).toBeCloseTo(0.1, 10)
  })

  it('lo que el catalogo no conoce baja la cobertura en vez de inventarse', () => {
    // Los fondos privados, el club, el oro y el BTC no estan en el catalogo de
    // este test: la banda global se pondera solo sobre lo conocido.
    expect(comparativa.rentabilidadDespues?.cobertura).toBeLessThan(1)
    expect(comparativa.rentabilidadDespues?.cobertura).toBeGreaterThan(0)
  })

  it('los totales de los dos lados cuadran entre si', () => {
    expect(comparativa.totalAntesUsd).toBe(1_000_000)
    expect(comparativa.totalDespuesUsd).toBeCloseTo(1_000_000, 2)
  })

  it('una linea conservada hereda el rendimiento de la posicion original', () => {
    const conservadas = [
      posicion({
        institucionProducto: 'Fondo raro',
        claseModelo: 'privados',
        assetClass: 'Alternativos Multi Asset Class',
        valorUsd: 200_000,
        rendimientoEst: 0.09,
        cta: 'conservar',
      }),
      posicion({ institucionProducto: 'Caja', valorUsd: 800_000, cta: 'venta_total' }),
    ]
    const planConPiso = generarPlan({
      perfil: 'Moderado',
      patrimonioTotalUsd: 1_000_000,
      benchmark: BENCHMARK,
      pesos: {
        fijo: { 'ETF Bonos': 1 },
        variable: { 'iShares Core S&P 500': 1 },
        otros: { 'BTC (IBIT)': 1 },
      },
      pisos: [
        { clase: 'privados', montoUsd: 200_000, origen: 'conservado', etiqueta: 'Fondo raro' },
      ],
      ticketMinimoUsd: 20_000,
      fallbacks: { fijo: 'Flip Panda', variable: 'Flip Cobra' },
    })

    const resultado = armarComparativa(conservadas, planConPiso, catalogo)
    const privados = resultado.filas.find((f) => f.clase === 'privados')
    const linea = privados?.despuesSub.find((s) => s.etiqueta === 'Fondo raro')

    expect(linea?.conservada).toBe(true)
    expect(linea?.rentabilidad?.rango.min).toBeCloseTo(0.09, 10)
  })
})
