import { describe, expect, it } from 'vitest'

import type { AjusteLinea, LineaPlan } from '../../domain/tipos.js'
import { fijarLineas } from '../lineas.js'

/**
 * Montos clavados instrumento por instrumento.
 *
 * El invariante que sostiene todo lo demas: el total de cada clase no se mueve.
 * Quien decide cuanto vale Renta Fija es el benchmark; esto solo decide con que
 * se ejecuta. Si esta funcion pudiera cambiar el total de una clase, el blotter
 * dejaria de cuadrar contra el patrimonio y nadie sabria por que.
 */

const linea = (
  instrumento: string,
  usd: number,
  extra: Partial<LineaPlan> = {},
): LineaPlan => ({ instrumento, clase: 'fijo', usd, ...extra })

const totalDe = (lineas: readonly LineaPlan[], clase: string): number =>
  lineas.filter((l) => l.clase === clase).reduce((acc, l) => acc + l.usd, 0)

const usdDe = (lineas: readonly LineaPlan[], instrumento: string): number =>
  lineas.find((l) => l.instrumento === instrumento)?.usd ?? 0

describe('fijarLineas', () => {
  const BASE: readonly LineaPlan[] = [
    linea('Treasury 7-10y', 40_000),
    linea('Corporate Bond', 35_000),
    linea('Treasury 1-3y', 25_000),
  ]

  it('sin ajustes devuelve las lineas tal cual', () => {
    const r = fijarLineas(BASE, [])
    expect(r.lineas).toBe(BASE)
    expect(r.avisos).toStrictEqual([])
  })

  it('clava el monto pedido y prorratea el resto entre las libres', () => {
    const ajustes: AjusteLinea[] = [
      { clase: 'fijo', instrumento: 'Treasury 7-10y', montoUsd: 50_000 },
    ]
    const { lineas } = fijarLineas(BASE, ajustes)

    expect(usdDe(lineas, 'Treasury 7-10y')).toBe(50_000)
    // Quedan 50,000 para repartir entre 35,000 y 25,000: 7/12 y 5/12.
    expect(usdDe(lineas, 'Corporate Bond')).toBeCloseTo(50_000 * (35 / 60), 6)
    expect(usdDe(lineas, 'Treasury 1-3y')).toBeCloseTo(50_000 * (25 / 60), 6)
  })

  it('el total de la clase no se mueve — es el invariante', () => {
    const casos: AjusteLinea[][] = [
      [{ clase: 'fijo', instrumento: 'Treasury 7-10y', montoUsd: 50_000 }],
      [{ clase: 'fijo', instrumento: 'Treasury 7-10y', montoUsd: 0 }],
      [{ clase: 'fijo', instrumento: 'Corporate Bond', montoUsd: 99_999 }],
      [
        { clase: 'fijo', instrumento: 'Treasury 7-10y', montoUsd: 10_000 },
        { clase: 'fijo', instrumento: 'Corporate Bond', montoUsd: 10_000 },
      ],
    ]

    for (const ajustes of casos) {
      const { lineas } = fijarLineas(BASE, ajustes)
      expect(totalDe(lineas, 'fijo')).toBeCloseTo(100_000, 6)
    }
  })

  it('clavar en cero deja la linea en cero y reparte su plata entre las otras', () => {
    const { lineas } = fijarLineas(BASE, [
      { clase: 'fijo', instrumento: 'Treasury 1-3y', montoUsd: 0 },
    ])
    expect(usdDe(lineas, 'Treasury 1-3y')).toBe(0)
    expect(usdDe(lineas, 'Treasury 7-10y')).toBeCloseTo(100_000 * (40 / 75), 6)
  })

  it('un monto negativo se lee como cero, no como una resta', () => {
    const { lineas } = fijarLineas(BASE, [
      { clase: 'fijo', instrumento: 'Treasury 1-3y', montoUsd: -5_000 },
    ])
    expect(usdDe(lineas, 'Treasury 1-3y')).toBe(0)
    expect(totalDe(lineas, 'fijo')).toBeCloseTo(100_000, 6)
  })

  it('pedir mas de lo que la clase tiene se recorta y se avisa', () => {
    const { lineas, avisos } = fijarLineas(BASE, [
      { clase: 'fijo', instrumento: 'Treasury 7-10y', montoUsd: 150_000 },
    ])

    expect(usdDe(lineas, 'Treasury 7-10y')).toBeCloseTo(100_000, 6)
    expect(usdDe(lineas, 'Corporate Bond')).toBe(0)
    expect(totalDe(lineas, 'fijo')).toBeCloseTo(100_000, 6)
    expect(avisos).toHaveLength(1)
    expect(avisos[0]).toContain('fija el monto de la clase')
  })

  /**
   * Lo conservado vale lo que el cliente tiene. Bajarlo desde el objetivo
   * pediria vender, y vender se marca en la ficha — es la misma regla que ya
   * gobierna los ajustes de clase, un nivel mas abajo.
   */
  it('los pisos no ceden ni reciben: solo se reparte lo que puso el modelo', () => {
    const conPiso: LineaPlan[] = [
      linea('Depto Barranco', 100_000, { piso: 'conservado', residuales: 'exenta' }),
      linea('Treasury 7-10y', 60_000),
      linea('Corporate Bond', 40_000),
    ]

    const { lineas } = fijarLineas(conPiso, [
      { clase: 'fijo', instrumento: 'Treasury 7-10y', montoUsd: 80_000 },
    ])

    expect(usdDe(lineas, 'Depto Barranco')).toBe(100_000)
    expect(usdDe(lineas, 'Treasury 7-10y')).toBe(80_000)
    expect(usdDe(lineas, 'Corporate Bond')).toBeCloseTo(20_000, 6)
    expect(totalDe(lineas, 'fijo')).toBeCloseTo(200_000, 6)
  })

  it('un ajuste sobre una linea de piso se ignora', () => {
    const conPiso: LineaPlan[] = [
      linea('Depto Barranco', 100_000, { piso: 'conservado', residuales: 'exenta' }),
      linea('Treasury 7-10y', 60_000),
      linea('Corporate Bond', 40_000),
    ]

    const { lineas } = fijarLineas(conPiso, [
      { clase: 'fijo', instrumento: 'Depto Barranco', montoUsd: 10_000 },
    ])

    expect(lineas).toStrictEqual(conPiso)
  })

  /**
   * Su monto *es* el de la clase, asi que clavarla seria fijar la clase
   * escribiendo en el sitio equivocado. El motor la devuelve al total y lo dice
   * en vez de aceptar en silencio un numero que no va a salir impreso.
   */
  it('la unica linea libre de su clase vuelve al total de la clase, con aviso', () => {
    const soloUna: LineaPlan[] = [linea('Cash', 47_000, { clase: 'cash', residuales: 'exenta' })]

    const { lineas, avisos } = fijarLineas(soloUna, [
      { clase: 'cash', instrumento: 'Cash', montoUsd: 10_000 },
    ])

    expect(usdDe(lineas, 'Cash')).toBeCloseTo(47_000, 6)
    expect(avisos).toHaveLength(1)
    expect(avisos[0]).toContain('fija el monto de la clase')
  })

  it('lo clavado queda exento del barrido de residuales', () => {
    const { lineas } = fijarLineas(BASE, [
      { clase: 'fijo', instrumento: 'Treasury 7-10y', montoUsd: 5_000 },
    ])

    expect(lineas.find((l) => l.instrumento === 'Treasury 7-10y')?.residuales).toBe('exenta')
    // Las libres siguen siendo plenas: la regla del ticket las sigue mirando.
    expect(lineas.find((l) => l.instrumento === 'Corporate Bond')?.residuales).toBeUndefined()
  })

  it('cada clase se resuelve sola, sin mirar a las vecinas', () => {
    const dosClases: LineaPlan[] = [
      linea('Treasury 7-10y', 60_000),
      linea('Corporate Bond', 40_000),
      linea('S&P 500', 70_000, { clase: 'variable' }),
      linea('Nasdaq', 30_000, { clase: 'variable' }),
    ]

    const { lineas } = fijarLineas(dosClases, [
      { clase: 'variable', instrumento: 'S&P 500', montoUsd: 90_000 },
    ])

    expect(totalDe(lineas, 'fijo')).toBeCloseTo(100_000, 6)
    expect(totalDe(lineas, 'variable')).toBeCloseTo(100_000, 6)
    expect(usdDe(lineas, 'Treasury 7-10y')).toBe(60_000)
    expect(usdDe(lineas, 'Nasdaq')).toBeCloseTo(10_000, 6)
  })

  it('el mismo nombre en dos clases no se confunde: la clave lleva la clase', () => {
    const homonimas: LineaPlan[] = [
      linea('Oro', 30_000),
      linea('Bonos', 70_000),
      linea('Oro', 60_000, { clase: 'otros' }),
      linea('BTC', 40_000, { clase: 'otros' }),
    ]

    const { lineas } = fijarLineas(homonimas, [
      { clase: 'otros', instrumento: 'Oro', montoUsd: 80_000 },
    ])

    expect(lineas.filter((l) => l.clase === 'fijo').map((l) => l.usd)).toStrictEqual([
      30_000, 70_000,
    ])
    expect(lineas.find((l) => l.clase === 'otros' && l.instrumento === 'Oro')?.usd).toBe(80_000)
    expect(lineas.find((l) => l.clase === 'otros' && l.instrumento === 'BTC')?.usd).toBeCloseTo(
      20_000,
      6,
    )
  })

  it('con las libres en cero, el resto se reparte en partes iguales', () => {
    // No hay proporcion que respetar y suponer una inventaria una preferencia
    // que nadie expreso.
    const enCero: LineaPlan[] = [
      linea('Treasury 7-10y', 100_000),
      linea('Corporate Bond', 0),
      linea('Treasury 1-3y', 0),
    ]

    const { lineas } = fijarLineas(enCero, [
      { clase: 'fijo', instrumento: 'Treasury 7-10y', montoUsd: 40_000 },
    ])

    expect(usdDe(lineas, 'Corporate Bond')).toBeCloseTo(30_000, 6)
    expect(usdDe(lineas, 'Treasury 1-3y')).toBeCloseTo(30_000, 6)
  })

  /**
   * Una linea libre sin dinero deja de ser una linea; una clavada en cero se
   * queda. La diferencia importa: la fila es el unico sitio desde donde el
   * asesor puede soltar lo que clavo, y borrarla lo dejaria con un ajuste
   * invisible que no puede deshacer.
   */
  it('la libre que queda en cero sale del plan; la clavada en cero se queda', () => {
    const { lineas } = fijarLineas(BASE, [
      { clase: 'fijo', instrumento: 'Treasury 7-10y', montoUsd: 100_000 },
    ])

    expect(lineas.map((l) => l.instrumento)).toStrictEqual(['Treasury 7-10y'])
    expect(totalDe(lineas, 'fijo')).toBeCloseTo(100_000, 6)
  })

  it('la clavada en cero se queda, para poder soltarla', () => {
    const { lineas } = fijarLineas(BASE, [
      { clase: 'fijo', instrumento: 'Treasury 1-3y', montoUsd: 0 },
    ])

    expect(lineas.map((l) => l.instrumento)).toContain('Treasury 1-3y')
    expect(usdDe(lineas, 'Treasury 1-3y')).toBe(0)
  })

  it('un ajuste sobre un instrumento que el plan no imprimio no hace nada', () => {
    const { lineas, avisos } = fijarLineas(BASE, [
      { clase: 'fijo', instrumento: 'Un ETF que ya no sale', montoUsd: 50_000 },
    ])

    expect(lineas).toBe(BASE)
    expect(avisos).toStrictEqual([])
  })
})
