import { describe, expect, it } from 'vitest'

import type { Benchmark, Piso } from '../../domain/tipos.js'
import { generarPlan } from '../../plan.js'
import type { EntradaPlan } from '../../plan.js'
import { armarPropuesta } from '../index.js'
import { reparosParaPublicar, sePuedePublicar } from '../publicacion.js'
import type { PosicionPropuesta, Propuesta } from '../tipos.js'

/**
 * Que se puede publicar y que no.
 *
 * Publicar es el unico momento en que esta herramienta deja una cifra escrita
 * para siempre, asi que lo que se prueba aca es que no deje escribir la que no
 * se puede sostener: una que no cuadra, una vacia, o una en la que hay dinero
 * sobre el que nadie decidio nada.
 */

const BENCHMARK: Benchmark = {
  fijo: 0.3,
  variable: 0.25,
  privados: 0.1,
  club: 0.1,
  otros: 0.05,
  inm: 0.1,
  cash: 0.1,
}

const PESOS = {
  fijo: { 'ETF Fijo A': 0.6, 'ETF Fijo B': 0.4 },
  variable: { 'ETF Variable A': 0.7, 'ETF Variable B': 0.3 },
  otros: { 'BTC (IBIT)': 0.85, Oro: 0.15 },
}

const posicion = (
  parcial: Partial<PosicionPropuesta> & { valorUsd: number },
): PosicionPropuesta => ({
  orden: 1,
  institucionProducto: 'Posición',
  origen: 'financiero',
  tipoFicha: 'Depósito a plazo',
  assetClass: 'Money Market',
  claseModelo: 'cash',
  productoId: null,
  moneda: 'USD',
  plaza: 'Perú',
  rendimientoEst: null,
  nota: '',
  pais: null,
  pctPertenencia: 1,
  valorDeclaradoUsd: parcial.valorUsd,
  uso: null,
  esInvertible: true,
  cta: 'venta_total',
  montoVentaParcial: 0,
  ...parcial,
})

const PISOS: readonly Piso[] = [
  { clase: 'cash', montoUsd: 300_000, origen: 'conservado', etiqueta: 'Banco A plazo fijo' },
]

const entradaPlan = (pisos: readonly Piso[]): EntradaPlan => ({
  perfil: 'Moderado',
  patrimonioTotalUsd: 1_000_000,
  benchmark: BENCHMARK,
  pesos: PESOS,
  pisos,
  ticketMinimoUsd: 20_000,
  fallbacks: { fijo: 'ETF Fijo A', variable: 'ETF Variable A' },
})

/** Una propuesta que cuadra, con todas las posiciones decididas. */
const armar = (posiciones: readonly PosicionPropuesta[]): Propuesta =>
  armarPropuesta({
    cliente: { nombre: 'Cliente de prueba', perfil: 'Moderado', mandato: null },
    posiciones,
    plan: generarPlan(entradaPlan(PISOS)),
    modeloPuro: generarPlan(entradaPlan([])),
    pisos: PISOS,
    benchmark: BENCHMARK,
    parametros: { ticketMinimoUsd: 20_000, colchonLiquidezUsd: 0, fxPenUsd: 3.4 },
  })

const DECIDIDAS: readonly PosicionPropuesta[] = [
  posicion({
    orden: 1,
    institucionProducto: 'Banco A plazo fijo',
    valorUsd: 300_000,
    cta: 'conservar',
  }),
  posicion({ orden: 2, institucionProducto: 'Banco B cuenta', valorUsd: 700_000 }),
]

const codigos = (propuesta: Propuesta) => reparosParaPublicar(propuesta).map((r) => r.codigo)

describe('reparosParaPublicar', () => {
  it('no pone reparos a una propuesta que cuadra y está decidida', () => {
    const propuesta = armar(DECIDIDAS)

    expect(codigos(propuesta)).toEqual([])
    expect(sePuedePublicar(propuesta)).toBe(true)
  })

  it('no deja publicar con dinero sin marcar', () => {
    const propuesta = armar([
      ...DECIDIDAS.slice(0, 1),
      posicion({
        orden: 2,
        institucionProducto: 'Acciones sueltas',
        valorUsd: 700_000,
        claseModelo: 'variable',
        cta: 'sin_marcar',
      }),
    ])

    expect(codigos(propuesta)).toContain('sin_decidir')
    expect(sePuedePublicar(propuesta)).toBe(false)
  })

  it('no deja publicar un blotter que no cierra en cero', () => {
    const propuesta = armar(DECIDIDAS)
    const descuadrada: Propuesta = {
      ...propuesta,
      seccion7: { ...propuesta.seccion7, cuadreUsd: 25_000 },
    }

    expect(codigos(descuadrada)).toContain('cuadre_blotter')
  })

  it('no deja publicar un objetivo que no cuadra contra el patrimonio', () => {
    const propuesta = armar(DECIDIDAS)
    const descuadrada: Propuesta = {
      ...propuesta,
      seccion6: { ...propuesta.seccion6, cuadreUsd: -1_200 },
    }

    expect(codigos(descuadrada)).toContain('cuadre_objetivo')
  })

  it('deja pasar un centavo de coma flotante', () => {
    const propuesta = armar(DECIDIDAS)
    const conRuido: Propuesta = {
      ...propuesta,
      seccion6: { ...propuesta.seccion6, cuadreUsd: 0.004 },
      seccion7: { ...propuesta.seccion7, cuadreUsd: -0.004 },
    }

    expect(codigos(conRuido)).toEqual([])
  })

  it('no deja publicar un portafolio objetivo vacío', () => {
    const propuesta = armar(DECIDIDAS)
    const vacia: Propuesta = { ...propuesta, seccion6: { ...propuesta.seccion6, grupos: [] } }

    expect(codigos(vacia)).toContain('objetivo_vacio')
  })

  it('junta todos los reparos en vez de parar en el primero', () => {
    const propuesta = armar(DECIDIDAS)
    const rota: Propuesta = {
      ...propuesta,
      seccion6: { ...propuesta.seccion6, grupos: [], cuadreUsd: 900 },
      seccion7: { ...propuesta.seccion7, cuadreUsd: 900 },
    }

    expect(codigos(rota)).toEqual(['objetivo_vacio', 'cuadre_objetivo', 'cuadre_blotter'])
  })

  it('escribe el monto del descuadre en el mensaje', () => {
    const propuesta = armar(DECIDIDAS)
    const descuadrada: Propuesta = {
      ...propuesta,
      seccion7: { ...propuesta.seccion7, cuadreUsd: 25_000 },
    }

    const mensaje = reparosParaPublicar(descuadrada).find((r) => r.codigo === 'cuadre_blotter')
    expect(mensaje?.mensaje).toContain('25,000.00')
  })
})
