import { describe, expect, it } from 'vitest'

import type { Benchmark, Piso } from '../../domain/tipos.js'
import { redistribuirInmobiliario } from '../../entrada.js'
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

  /**
   * De donde sale lo que el portafolio gana.
   *
   * Es la pregunta que el peso deja a medias, y por eso va en su propia
   * columna: cash es el 40% del dinero de este caso y aporta el 57% de la
   * renta; el inmueble es el 40% del dinero y no aporta nada, porque no tiene
   * retorno cargado.
   */
  describe('el aporte a la renta', () => {
    const renta = { cash: 300_000 * 0.05 + 100_000 * 0.01, fijo: 200_000 * 0.06 }
    const total = renta.cash + renta.fijo

    it('cada clase aporta su renta sobre la renta del portafolio', () => {
      expect(vista.filas.find((f) => f.clase === 'cash')?.aporteRenta).toBeCloseTo(
        renta.cash / total,
        10,
      )
      expect(vista.filas.find((f) => f.clase === 'fijo')?.aporteRenta).toBeCloseTo(
        renta.fijo / total,
        10,
      )
    })

    it('lo que no tiene retorno cargado aporta cero, no se le supone uno', () => {
      // El inmueble pesa 40% del patrimonio y aporta 0% de la renta. Es la
      // diferencia que la columna existe para mostrar.
      const inm = vista.filas.find((f) => f.clase === 'inm')
      expect(inm?.share).toBeCloseTo(0.4, 10)
      expect(inm?.aporteRenta).toBe(0)
    })

    it('los aportes de las clases suman uno', () => {
      const suma = vista.filas.reduce((acc, f) => acc + (f.aporteRenta ?? 0), 0)
      expect(suma).toBeCloseTo(1, 10)
    })

    it('las subfilas de una clase suman su aporte', () => {
      const cash = vista.filas.find((f) => f.clase === 'cash')
      const suma = (cash?.subfilas ?? []).reduce((acc, s) => acc + (s.aporteRenta ?? 0), 0)
      expect(suma).toBeCloseTo(cash?.aporteRenta ?? 0, 10)
    })

    it('sin nada con retorno, el aporte no se afirma en vez de valer cero', () => {
      const vacia = armarVistaHoy([posicion({ valorUsd: 100_000, rendimientoEst: null })])
      expect(vacia.filas[0]?.aporteRenta).toBeNull()
    })
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
      { retMin: 0.04, retMax: 0.05, distMin: null, distMax: null, distFrecuencia: null, moneda: 'USD', liquidez: null },
    ],
    [
      'iShares Core S&P 500',
      { retMin: 0.07, retMax: 0.1, distMin: null, distMax: null, distFrecuencia: null, moneda: 'USD', liquidez: null },
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

  it('con el toggle de inmuebles apagado, los dos lados miran el mismo universo', () => {
    // Comparar un "antes" que incluye los inmuebles de renta contra un
    // "despues" que el motor calculo sin ellos hacia que el patrimonio se
    // encogiera en pantalla sin que nadie vendiera nada.
    const conInmueble: PosicionPropuesta[] = [
      posicion({ institucionProducto: 'Depósito', valorUsd: 700_000, cta: 'venta_total' }),
      posicion({
        institucionProducto: 'Depto en renta',
        origen: 'inmueble',
        claseModelo: 'inm',
        assetClass: 'Inmobiliario Directo',
        uso: 'Renta',
        valorUsd: 300_000,
        cta: 'conservar',
      }),
    ]

    // Con el toggle apagado el motor recibe el benchmark sin la clase
    // inmobiliaria, igual que hace `armarEntradaPlan`.
    const planSinInmuebles = generarPlan({
      perfil: 'Moderado',
      patrimonioTotalUsd: 700_000,
      benchmark: redistribuirInmobiliario(BENCHMARK),
      pesos: {
        fijo: { 'ETF Bonos': 1 },
        variable: { 'iShares Core S&P 500': 1 },
        otros: { 'BTC (IBIT)': 1 },
      },
      pisos: [] as Piso[],
      ticketMinimoUsd: 20_000,
      fallbacks: { fijo: 'Flip Panda', variable: 'Flip Cobra' },
    })

    const r = armarComparativa(conInmueble, planSinInmuebles, catalogo, false)

    expect(r.totalAntesUsd).toBe(700_000)
    expect(r.totalDespuesUsd).toBeCloseTo(700_000, 2)
    expect(r.filas.every((f) => f.clase !== 'inm')).toBe(true)
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
