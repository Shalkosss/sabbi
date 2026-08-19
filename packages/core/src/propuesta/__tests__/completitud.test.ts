import { describe, expect, it } from 'vitest'

import { camposFaltantes, posicionesIncompletas } from '../completitud.js'
import type { PosicionCompletable } from '../completitud.js'

const completa: PosicionCompletable = {
  origen: 'financiero',
  esInvertible: true,
  assetClass: 'Money Market',
  claseModelo: 'cash',
  moneda: 'USD',
  valorUsd: 10_000,
  rendimientoEst: 0.045,
}

describe('camposFaltantes', () => {
  it('una posición completa no debe nada', () => {
    expect(camposFaltantes(completa)).toStrictEqual([])
  })

  it('exige clase, asset class, moneda, valor y rendimiento en lo financiero', () => {
    expect(
      camposFaltantes({
        ...completa,
        claseModelo: null,
        assetClass: null,
        moneda: null,
        valorUsd: 0,
        rendimientoEst: null,
      }),
    ).toStrictEqual(['claseModelo', 'assetClass', 'moneda', 'valorUsd', 'rendimientoEst'])
  })

  it('el rendimiento es obligatorio: sin él la rentabilidad del antes miente', () => {
    expect(camposFaltantes({ ...completa, rendimientoEst: null })).toStrictEqual([
      'rendimientoEst',
    ])
  })

  it('a un inmueble le exige el uso, y nada más si es de uso propio', () => {
    const usoPropio: PosicionCompletable = {
      ...completa,
      origen: 'inmueble',
      esInvertible: false,
      uso: null,
      claseModelo: null,
      rendimientoEst: null,
    }
    expect(camposFaltantes(usoPropio)).toStrictEqual(['uso'])
    expect(camposFaltantes({ ...usoPropio, uso: 'Uso propio' })).toStrictEqual([])
  })

  it('a un inmueble de renta le exige lo mismo que a lo financiero, menos el rendimiento', () => {
    const renta: PosicionCompletable = {
      ...completa,
      origen: 'inmueble',
      esInvertible: true,
      uso: 'Renta',
      claseModelo: 'inm',
      rendimientoEst: null,
    }
    expect(camposFaltantes(renta)).toStrictEqual([])
    expect(camposFaltantes({ ...renta, moneda: null })).toStrictEqual(['moneda'])
  })
})

describe('posicionesIncompletas', () => {
  it('devuelve solo las que deben algo, con su lista de campos', () => {
    const resultado = posicionesIncompletas([
      { ...completa, institucionProducto: 'Completa' },
      { ...completa, institucionProducto: 'Sin rendimiento', rendimientoEst: null },
    ])

    expect(resultado).toStrictEqual([
      { institucionProducto: 'Sin rendimiento', campos: ['rendimientoEst'] },
    ])
  })
})
