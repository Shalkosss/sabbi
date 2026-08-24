import { describe, expect, it } from 'vitest'

import type { Benchmark, Piso } from '../../domain/tipos.js'
import { generarPlan } from '../../plan.js'
import { armarPropuesta } from '../index.js'
import { congelarPropuesta, FORMATO_SNAPSHOT, leerSnapshot } from '../snapshot.js'
import type { PosicionPropuesta, Propuesta } from '../tipos.js'

/**
 * Lo que se congela tiene que volver igual.
 *
 * El snapshot es la unica cifra que esta herramienta guarda, y es la que un
 * cliente tiene impresa. Dos garantias: que lo guardado vuelve identico despues
 * de pasar por JSON, y que lo que no es un snapshot legible se rechaza con un
 * motivo en vez de pintarse como si fuera la propuesta.
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

const PISOS: readonly Piso[] = [
  { clase: 'cash', montoUsd: 200_000, origen: 'conservado', etiqueta: 'Banco A' },
]

const POSICIONES: readonly PosicionPropuesta[] = [
  {
    orden: 1,
    institucionProducto: 'Banco A',
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
    valorDeclaradoUsd: 1_000_000,
    valorUsd: 1_000_000,
    uso: null,
    esInvertible: true,
    cta: 'conservar',
    montoVentaParcial: 0,
  },
]

const PROPUESTA: Propuesta = armarPropuesta({
  cliente: { nombre: 'Ana Tumi', perfil: 'Moderado', mandato: 'Renta' },
  posiciones: POSICIONES,
  plan: generarPlan({
    perfil: 'Moderado',
    patrimonioTotalUsd: 1_000_000,
    benchmark: BENCHMARK,
    pesos: {
      fijo: { 'ETF Fijo A': 1 },
      variable: { 'ETF Variable A': 1 },
      otros: { 'BTC (IBIT)': 1 },
    },
    pisos: PISOS,
    ticketMinimoUsd: 20_000,
    fallbacks: { fijo: 'ETF Fijo A', variable: 'ETF Variable A' },
  }),
  modeloPuro: generarPlan({
    perfil: 'Moderado',
    patrimonioTotalUsd: 1_000_000,
    benchmark: BENCHMARK,
    pesos: {
      fijo: { 'ETF Fijo A': 1 },
      variable: { 'ETF Variable A': 1 },
      otros: { 'BTC (IBIT)': 1 },
    },
    pisos: [],
    ticketMinimoUsd: 20_000,
    fallbacks: { fijo: 'ETF Fijo A', variable: 'ETF Variable A' },
  }),
  pisos: PISOS,
  benchmark: BENCHMARK,
  parametros: { ticketMinimoUsd: 20_000, colchonLiquidezUsd: 0, fxPenUsd: 3.4 },
})

const META = {
  macro: { version: 7, esDeFabrica: false },
  motor: 'v8',
  congeladaEn: '2026-03-14T15:00:00.000Z',
}

/** Como llega de vuelta de la base: por `jsonb`, no por referencia. */
const idaYVuelta = (valor: unknown): unknown => JSON.parse(JSON.stringify(valor))

describe('congelarPropuesta y leerSnapshot', () => {
  it('devuelve la propuesta igual después de pasar por JSON', () => {
    const guardado = idaYVuelta(congelarPropuesta(PROPUESTA, META))
    const lectura = leerSnapshot(guardado)

    expect(lectura.ok).toBe(true)
    if (!lectura.ok) return

    expect(lectura.snapshot.propuesta).toEqual(PROPUESTA)
    expect(lectura.snapshot.macro).toEqual({ version: 7, esDeFabrica: false })
    expect(lectura.snapshot.motor).toBe('v8')
    expect(lectura.snapshot.congeladaEn).toBe(META.congeladaEn)
  })

  it('conserva los dos cuadres, que son lo que permitió publicar', () => {
    const lectura = leerSnapshot(idaYVuelta(congelarPropuesta(PROPUESTA, META)))
    if (!lectura.ok) throw new Error(lectura.motivo)

    expect(lectura.snapshot.propuesta.seccion6.cuadreUsd).toBe(PROPUESTA.seccion6.cuadreUsd)
    expect(lectura.snapshot.propuesta.seccion7.cuadreUsd).toBe(PROPUESTA.seccion7.cuadreUsd)
  })

  it('acepta la macro de fábrica, que no tiene número de versión', () => {
    const guardado = idaYVuelta(
      congelarPropuesta(PROPUESTA, { ...META, macro: { version: null, esDeFabrica: true } }),
    )
    const lectura = leerSnapshot(guardado)

    expect(lectura.ok).toBe(true)
    if (lectura.ok) expect(lectura.snapshot.macro).toEqual({ version: null, esDeFabrica: true })
  })

  it('rechaza lo que no es un objeto', () => {
    for (const basura of [null, undefined, 'algo', 42, []]) {
      expect(leerSnapshot(basura).ok).toBe(false)
    }
  })

  it('rechaza un formato que esta versión no sabe leer', () => {
    const guardado = { ...(idaYVuelta(congelarPropuesta(PROPUESTA, META)) as object), formato: 99 }
    const lectura = leerSnapshot(guardado)

    expect(lectura.ok).toBe(false)
    if (!lectura.ok) expect(lectura.motivo).toContain('formato')
  })

  it('rechaza una propuesta a la que le falta una sección, y dice cuál', () => {
    const guardado = idaYVuelta(congelarPropuesta(PROPUESTA, META)) as {
      propuesta: Record<string, unknown>
    }
    delete guardado.propuesta['seccion7']

    const lectura = leerSnapshot(guardado)
    expect(lectura.ok).toBe(false)
    if (!lectura.ok) expect(lectura.motivo).toContain('blotter')
  })

  it('rechaza un snapshot que no dice con qué macro se calculó', () => {
    const guardado = idaYVuelta(congelarPropuesta(PROPUESTA, META)) as Record<string, unknown>
    delete guardado['macro']

    const lectura = leerSnapshot(guardado)
    expect(lectura.ok).toBe(false)
    if (!lectura.ok) expect(lectura.motivo).toContain('macro')
  })

  it('sobrevive a un snapshot sin versión de motor: es metadato, no cifra', () => {
    const guardado = idaYVuelta(congelarPropuesta(PROPUESTA, META)) as Record<string, unknown>
    delete guardado['motor']

    const lectura = leerSnapshot(guardado)
    expect(lectura.ok).toBe(true)
    if (lectura.ok) expect(lectura.snapshot.motor).toBe('desconocido')
  })

  it('escribe el formato vigente', () => {
    expect(congelarPropuesta(PROPUESTA, META).formato).toBe(FORMATO_SNAPSHOT)
  })
})
