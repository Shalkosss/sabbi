import { describe, expect, it } from 'vitest'

import type { Celda, Hoja } from '../../xlsx/leer.js'
import { parsearRetornosDeHoja } from '../parsear.js'

/**
 * La hoja se arma a mano y no desde un .xlsm de muestra.
 *
 * El libro real trae los fondos que la mesa mira y no puede vivir en el
 * repositorio. Una hoja sintetica ademas deja escribir el caso raro — la
 * columna duplicada, el mes en `Jan-25`, el bloque de metricas corrido — que
 * en el archivo real aparece una sola vez y por accidente.
 */

/** Serial de Excel de un mes: el 30/12/1899 es el cero. */
const serial = (anio: number, mes: number): number =>
  Math.round((Date.UTC(anio, mes - 1, 1) - Date.UTC(1899, 11, 30)) / 86_400_000)

const hoja = (filas: readonly (readonly Celda[])[]): Hoja => ({ nombre: 'Retornos', filas })

/**
 * Una hoja con la forma del libro: dos filas de encabezado, la serie, y el
 * bloque de metricas anclado en «Asset Class».
 */
const LIBRO = hoja([
  ['Corte', null, null, null, null],
  [null, 'Private Debt', null, null, 'Real Estate'],
  ['Net total Return', 'Fondo Uno', 'S&P 500 IVV', 'Fondo Uno', 'S&P500 IVV'],
  [serial(2025, 1), 0.01, 0.03, 0.01, 0.03],
  [serial(2025, 2), 0.02, 0.04, null, 0.04],
  [serial(2025, 3), 0.015, -0.01, null, null],
  [],
  ['Asset Class', 'PD', 'PD', 'PD', 'RE'],
  ['Inception Date', serial(2024, 11), null, null, 'Jan-25'],
  ['Guidance Total Return Corto Plazo', 0.105, null, null, null],
  ['Domicilio', 'US', null, null, 'Luxemburgo'],
  ['3M', 0.0459, 0.0596, null, null],
  ['1 Y', null, null, null, null],
  ['Retorno total since inception anualizado', 0.1975, 0.2604, null, null],
  ['Desviación estándar since inception', 0.0087, 0.0918, null, null],
  ['Ratio de sharpe since inception', 17.5, 2.35, null, null],
  [2025, 0.0459, 0.0596, null, null],
  [2024, null, null, null, null],
  ['Treasury 10Y (enero)', 0.04156],
  ['Treasury 10Y (febrero)', 0.03962],
])

describe('parsearRetornosDeHoja', () => {
  const leido = parsearRetornosDeHoja(LIBRO)
  const de = (nombre: string) => leido.fondos.find((f) => f.nombre === nombre)

  it('lee la ficha de cada columna', () => {
    const uno = de('Fondo Uno')!
    expect(uno.assetClass).toBe('Private Debt')
    expect(uno.inception).toBe('2024-11')
    expect(uno.guidanceCortoPlazo).toBe(0.105)
    expect(uno.domicilio).toBe('US')
    expect(uno.esReferencia).toBe(false)
  })

  it('convierte los seriales de fecha a `AAAA-MM`', () => {
    expect(de('Fondo Uno')!.serie.map((p) => p.mes)).toEqual(['2025-01', '2025-02', '2025-03'])
  })

  it('lee tambien el inception escrito a mano como `Jan-25`', () => {
    expect(de('S&P 500 IVV (Real Estate)')!.inception).toBe('2025-01')
  })

  it('reconoce los indices de mercado', () => {
    expect(de('S&P 500 IVV (Private Debt)')!.esReferencia).toBe(true)
  })

  describe('columnas homonimas', () => {
    it('fusiona las de la misma clase y gana la mas larga', () => {
      // «Fondo Uno» esta en B y en D, las dos bajo Private Debt: es un solo
      // fondo pegado dos veces.
      const uno = de('Fondo Uno')!
      expect(uno.serie).toHaveLength(3)
      expect(uno.columnas).toEqual(['B3', 'D3'])
      expect(leido.avisos.some((a) => a.motivo === 'columnas fusionadas')).toBe(true)
    })

    it('NO fusiona las de clases distintas: son la referencia de cada bloque', () => {
      // El mismo indice bajo dos clases son dos lineas de comparacion, no un
      // duplicado. Fusionarlas dejaria a Real Estate sin su benchmark.
      expect(de('S&P 500 IVV (Private Debt)')).toBeDefined()
      expect(de('S&P 500 IVV (Real Estate)')).toBeDefined()
    })

    it('unifica la grafia: la hoja escribe «S&P500» en un bloque y «S&P 500» en otro', () => {
      expect(leido.fondos.filter((f) => f.nombre.startsWith('S&P 500 IVV'))).toHaveLength(2)
      expect(leido.fondos.some((f) => f.nombre.startsWith('S&P500'))).toBe(false)
    })
  })

  it('trae el bloque de metricas que dejo la macro, para contrastar', () => {
    const declarada = leido.declaradas.get('Fondo Uno')!
    expect(declarada.retorno['3m']).toBe(0.0459)
    expect(declarada.retorno.si).toBe(0.1975)
    expect(declarada.sharpe.si).toBe(17.5)
    // Los anios llegan como numero y no como texto en la columna A.
    expect(declarada.anios[2025]).toBe(0.0459)
    expect(declarada.anios[2024]).toBeNull()
  })

  it('lee el Treasury por nombre de mes, sin inventarle el anio', () => {
    expect(leido.treasuryPorMes).toEqual({ enero: 0.04156, febrero: 0.03962 })
  })

  it('descarta la columna sin una sola observacion y lo dice', () => {
    const vacia = hoja([
      ['Corte'],
      [null, 'Private Debt'],
      ['Net total Return', 'Fondo Sin Serie'],
      [serial(2025, 1), null],
      ['Asset Class', 'PD'],
    ])
    const resultado = parsearRetornosDeHoja(vacia)
    expect(resultado.fondos).toHaveLength(0)
    expect(resultado.avisos[0]?.motivo).toBe('columna sin serie')
  })

  it('se planta si la hoja no tiene el ancla «Asset Class»', () => {
    // Sin ella no se sabe donde termina la serie: el bloque de metricas
    // entraria como si fueran meses y ensuciaria todas las ventanas.
    expect(() => parsearRetornosDeHoja(hoja([['Corte'], [], ['x', 'Fondo']]))).toThrow(
      /Asset Class/,
    )
  })
})
