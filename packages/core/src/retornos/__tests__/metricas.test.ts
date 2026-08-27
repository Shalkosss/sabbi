import { describe, expect, it } from 'vitest'

import { abrirRetornos, calcularMetricas, ventanaDe } from '../metricas.js'
import type { ObservacionMensual } from '../tipos.js'
import { rangoDeMeses } from '../ventanas.js'
import { ESPERADO_ORENT, ORENT, PARAMETROS_ORENT, SERIE_ORENT } from './orent.js'

/** Doce decimales: cualquier diferencia de convencion aparece mucho antes. */
const DECIMALES = 12

describe('calcularMetricas — caso ORENT', () => {
  const metricas = calcularMetricas(ORENT, SERIE_ORENT, PARAMETROS_ORENT)
  const ventana = (clave: string) => ventanaDe(metricas, clave)!
  const anio = (numero: number) => metricas.anios.find((a) => a.anio === numero)!

  describe('retornos por ventana', () => {
    it('3M y 6M van acumulados, sin anualizar', () => {
      expect(ventana('3m').retorno).toBeCloseTo(ESPERADO_ORENT.retorno3m, DECIMALES)
      expect(ventana('6m').retorno).toBeCloseTo(ESPERADO_ORENT.retorno6m, DECIMALES)
    })

    it('1Y va acumulado: doce meses ya son un anio', () => {
      expect(ventana('1y').retorno).toBeCloseTo(ESPERADO_ORENT.retorno1y, DECIMALES)
    })

    it('2Y y 3Y van anualizados', () => {
      expect(ventana('2y').retorno).toBeCloseTo(ESPERADO_ORENT.retorno2y, DECIMALES)
      expect(ventana('3y').retorno).toBeCloseTo(ESPERADO_ORENT.retorno3y, DECIMALES)
    })

    it('since inception se anualiza por los meses que hay', () => {
      expect(ventana('si').retorno).toBeCloseTo(ESPERADO_ORENT.retornoSi, DECIMALES)
      expect(ventana('si').mesesUsados).toBe(45)
    })
  })

  describe('riesgo', () => {
    it('la desviacion es poblacional y anualizada', () => {
      expect(ventana('si').desviacion).toBeCloseTo(ESPERADO_ORENT.desviacionSi, DECIMALES)
      expect(ventana('1y').desviacion).toBeCloseTo(ESPERADO_ORENT.desviacion1y, DECIMALES)
    })

    it('el Sharpe descuenta el risk-free escalar', () => {
      expect(ventana('si').sharpe).toBeCloseTo(ESPERADO_ORENT.sharpeSi, DECIMALES)
      expect(ventana('1y').sharpe).toBeCloseTo(ESPERADO_ORENT.sharpe1y, DECIMALES)
    })

    it('3M y 6M no publican riesgo: tres observaciones no son una desviacion', () => {
      expect(ventana('3m').desviacion).toBeNull()
      expect(ventana('3m').sharpe).toBeNull()
      expect(ventana('6m').desviacion).toBeNull()
      expect(ventana('6m').sharpe).toBeNull()
    })
  })

  describe('anios calendario', () => {
    it('reproduce los anios completos', () => {
      expect(anio(2025).retorno).toBeCloseTo(ESPERADO_ORENT.anio2025, DECIMALES)
      expect(anio(2024).retorno).toBeCloseTo(ESPERADO_ORENT.anio2024, DECIMALES)
      expect(anio(2023).retorno).toBeCloseTo(ESPERADO_ORENT.anio2023, DECIMALES)
      expect(anio(2025).parcial).toBe(false)
    })

    it('2026 va parcial: seis meses, no doce', () => {
      expect(anio(2026).retorno).toBeCloseTo(ESPERADO_ORENT.anio2026, DECIMALES)
      expect(anio(2026).parcial).toBe(true)
      expect(anio(2026).mesesUsados).toBe(6)
    })

    it('2022 va parcial: el fondo nacio en octubre', () => {
      expect(anio(2022).parcial).toBe(true)
      expect(anio(2022).mesesUsados).toBe(3)
    })

    it('un anio anterior a la serie no inventa un cero', () => {
      expect(anio(2019).retorno).toBeNull()
      expect(anio(2019).mesesUsados).toBe(0)
    })
  })

  describe('lo que no alcanza', () => {
    it('4Y y 5Y quedan en n/d: la serie tiene 45 meses', () => {
      expect(ventana('4y').retorno).toBeNull()
      expect(ventana('4y').desviacion).toBeNull()
      expect(ventana('4y').sharpe).toBeNull()
      expect(ventana('5y').retorno).toBeNull()
    })
  })

  it('la serie ordena sola: el llamador no tiene que hacerlo', () => {
    const alReves = [...SERIE_ORENT].reverse()
    const otras = calcularMetricas(ORENT, alReves, PARAMETROS_ORENT)

    expect(ventanaDe(otras, 'si')!.retorno).toBeCloseTo(ESPERADO_ORENT.retornoSi, DECIMALES)
    expect(otras.primerMes).toBe('2022-10')
    expect(otras.ultimoMes).toBe('2026-06')
  })

  it('no muta el arreglo que recibe', () => {
    const copia = [...SERIE_ORENT]
    calcularMetricas(ORENT, copia, PARAMETROS_ORENT)
    expect(copia.map((o) => o.mes)).toEqual(SERIE_ORENT.map((o) => o.mes))
  })
})

describe('abrirRetornos', () => {
  it('abre el retorno en capital y distribucion contra el NAV previo', () => {
    const apertura = abrirRetornos(SERIE_ORENT)
    // 2024-01: NAV 10.13 contra 10.15 de diciembre de 2023. El NAV cae y el
    // retorno total es positivo: todo el mes lo pago la distribucion.
    const enero = apertura.find((a) => a.mes === '2024-01')!

    expect(enero.capital).toBeCloseTo(10.13 / 10.15 - 1, DECIMALES)
    expect(enero.capital!).toBeLessThan(0)
    expect(enero.distribucion!).toBeGreaterThan(enero.total!)
    expect(enero.distribucion).toBeCloseTo(0.0039 - (10.13 / 10.15 - 1), DECIMALES)
    expect(enero.capital! + enero.distribucion!).toBeCloseTo(enero.total!, DECIMALES)
  })

  it('el primer mes no tiene apertura: no hay NAV anterior contra que medir', () => {
    const apertura = abrirRetornos(SERIE_ORENT)
    const primero = apertura[0]!

    expect(primero.mes).toBe('2022-10')
    expect(primero.total).toBe(0.0054)
    expect(primero.capital).toBeNull()
    expect(primero.distribucion).toBeNull()
  })

  it('un hueco en el NAV no se salta al mes anterior disponible', () => {
    const serie: ObservacionMensual[] = [
      { mes: '2025-01', nav: 100, retornoTotal: 0.01 },
      { mes: '2025-02', nav: null, retornoTotal: 0.01 },
      { mes: '2025-03', nav: 103, retornoTotal: 0.01 },
    ]
    const marzo = abrirRetornos(serie).find((a) => a.mes === '2025-03')!

    // Contra enero daria 3%, que es la ganancia de dos meses.
    expect(marzo.capital).toBeNull()
    expect(marzo.total).toBe(0.01)
  })

  it('sin retorno total no hay nada que abrir, aunque haya NAV', () => {
    const serie: ObservacionMensual[] = [
      { mes: '2025-01', nav: 100, retornoTotal: 0.01 },
      { mes: '2025-02', nav: 101, retornoTotal: null },
    ]
    const febrero = abrirRetornos(serie)[1]!

    expect(febrero.total).toBeNull()
    expect(febrero.capital).toBeNull()
  })
})

describe('ventanas incompletas', () => {
  const parametros = { riskFree: 0.04, anioTope: 2025, aniosAtras: 3 }
  const ficha = { ...ORENT, id: 'x', nombre: 'X' }

  it('un hueco adentro de la ventana la anula entera', () => {
    // Doce meses de calendario pero solo once con dato: no es un 1Y.
    const serie: ObservacionMensual[] = [...Array(13).keys()].map((i) => ({
      mes: `2025-${String(i + 1).padStart(2, '0')}`,
      nav: null,
      retornoTotal: i === 5 ? null : 0.01,
    }))

    const metricas = calcularMetricas(ficha, serie.slice(0, 12), parametros)
    expect(ventanaDe(metricas, '1y')!.retorno).toBeNull()
  })

  it('con la ventana justa alcanza', () => {
    const serie: ObservacionMensual[] = [...Array(12).keys()].map((i) => ({
      mes: `2025-${String(i + 1).padStart(2, '0')}`,
      nav: null,
      retornoTotal: 0.01,
    }))

    const metricas = calcularMetricas(ficha, serie, parametros)
    expect(ventanaDe(metricas, '1y')!.retorno).toBeCloseTo(1.01 ** 12 - 1, DECIMALES)
    expect(ventanaDe(metricas, '2y')!.retorno).toBeNull()
  })

  it('una serie vacia no produce ninguna metrica', () => {
    const metricas = calcularMetricas(ficha, [], parametros)

    expect(metricas.primerMes).toBeNull()
    expect(metricas.ultimoMes).toBeNull()
    expect(metricas.ventanas.every((v) => v.retorno === null)).toBe(true)
  })

  it('un fondo sin volatilidad no publica un Sharpe infinito', () => {
    const serie: ObservacionMensual[] = [...Array(12).keys()].map((i) => ({
      mes: `2025-${String(i + 1).padStart(2, '0')}`,
      nav: null,
      retornoTotal: 0.01,
    }))

    const metricas = calcularMetricas(ficha, serie, parametros)
    expect(ventanaDe(metricas, '1y')!.desviacion).toBeCloseTo(0, DECIMALES)
    expect(ventanaDe(metricas, '1y')!.sharpe).toBeNull()
  })
})

describe('rangoDeMeses', () => {
  it('incluye los dos extremos y cruza el fin de anio', () => {
    expect(rangoDeMeses('2025-11', '2026-02')).toEqual([
      '2025-11',
      '2025-12',
      '2026-01',
      '2026-02',
    ])
  })

  it('un solo mes es un rango de uno', () => {
    expect(rangoDeMeses('2025-03', '2025-03')).toEqual(['2025-03'])
  })

  it('un rango al reves esta vacio', () => {
    expect(rangoDeMeses('2026-01', '2025-01')).toEqual([])
  })
})
