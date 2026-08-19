import { describe, expect, it } from 'vitest'

import { decisionInicial } from '../decision.js'
import type { PosicionDecidible } from '../decision.js'

const OFRECIBLES = new Set(['fondo-oportunidad', 'ishares-core-sp500'])

const posicion = (parcial: Partial<PosicionDecidible> = {}): PosicionDecidible => ({
  origen: 'financiero',
  productoId: null,
  claseModelo: 'cash',
  ...parcial,
})

describe('decisionInicial', () => {
  it('vende lo que el cliente tiene y Sabbi no ofrece: es el dinero a repartir', () => {
    expect(decisionInicial(posicion({ productoId: 'deposito-banco-x' }), OFRECIBLES)).toBe(
      'venta_total',
    )
    expect(decisionInicial(posicion({ productoId: null }), OFRECIBLES)).toBe('venta_total')
  })

  it('conserva lo que ya está en el portafolio objetivo', () => {
    expect(
      decisionInicial(
        posicion({ productoId: 'fondo-oportunidad', claseModelo: 'privados' }),
        OFRECIBLES,
      ),
    ).toBe('conservar')
  })

  it('no liquida un inmueble para rebalancear', () => {
    expect(
      decisionInicial(posicion({ origen: 'inmueble', claseModelo: 'inm' }), OFRECIBLES),
    ).toBe('conservar')
    expect(
      decisionInicial(posicion({ origen: 'inmueble', claseModelo: null }), OFRECIBLES),
    ).toBe('conservar')
  })

  it('deja sin marcar lo que no puede decidir', () => {
    // Sin clase el motor no sabe dónde poner el dinero: es la fila que el
    // asesor tiene que mirar, y por eso no se decide por él.
    expect(decisionInicial(posicion({ claseModelo: null }), OFRECIBLES)).toBe('sin_marcar')
  })

  it('un catálogo vacío vende todo lo financiero, sin romperse', () => {
    expect(decisionInicial(posicion({ productoId: 'fondo-oportunidad' }), new Set())).toBe(
      'venta_total',
    )
  })

  it('es pura', () => {
    const p = posicion({ productoId: 'ishares-core-sp500', claseModelo: 'variable' })
    expect(decisionInicial(p, OFRECIBLES)).toBe(decisionInicial(p, OFRECIBLES))
  })
})
