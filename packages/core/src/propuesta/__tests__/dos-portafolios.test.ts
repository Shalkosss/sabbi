import { describe, expect, it } from 'vitest'

import type { AjusteClase, Benchmark, Restriccion } from '../../domain/tipos.js'
import { armarEntradaPlan } from '../../entrada.js'
import type { PosicionRevisada } from '../../entrada.js'
import { generarPlan } from '../../plan.js'
import type { DatosProducto, PosicionPropuesta } from '../tipos.js'
import { armarDosPortafolios } from '../vistas.js'

/**
 * El camino completo de un ajuste: de lo que el asesor toca a las dos
 * columnas que la pantalla pone lado a lado.
 *
 * Los tests del solver ya fijan la aritmetica. Lo que se prueba aca es que la
 * pieza de arriba no la pierda: que el portafolio del sistema se calcule sin
 * los ajustes, que el ajustado los lleve, y que los dos cuadren contra el
 * mismo patrimonio.
 */

const BENCHMARK: Benchmark = {
  inm: 0.2,
  fijo: 0.2,
  variable: 0.2,
  privados: 0.2,
  club: 0.1,
  otros: 0.05,
  cash: 0.05,
}

const PESOS = {
  fijo: { 'ETF Bonos': 1 },
  variable: { 'ETF Acciones': 1 },
  otros: { 'IBIT (BTC)': 1 },
}

const PATRIMONIO = 700_000

/** Una ficha simple: todo en cash, todo a la venta. El motor reparte entero. */
const POSICIONES: PosicionRevisada[] = [
  {
    institucionProducto: 'Cuenta corriente',
    origen: 'financiero',
    claseModelo: 'cash',
    productoId: null,
    valorUsd: PATRIMONIO,
    esInvertible: true,
    cta: 'venta_total',
    montoVentaParcial: 0,
  },
]

const PARA_LA_VISTA: PosicionPropuesta[] = POSICIONES.map((p) => ({
  ...p,
  orden: 1,
  tipoFicha: null,
  assetClass: 'Money Market',
  moneda: 'USD',
  plaza: 'Perú',
  rendimientoEst: 0.02,
  nota: '',
  pais: null,
  pctPertenencia: 1,
  valorDeclaradoUsd: p.valorUsd,
  uso: null,
}))

const CATALOGO: ReadonlyMap<string, DatosProducto> = new Map()

const planCon = (ajustes: readonly AjusteClase[], restricciones: readonly Restriccion[] = []) => {
  const derivacion = armarEntradaPlan(POSICIONES, {
    perfil: 'Moderado',
    benchmark: BENCHMARK,
    pesos: PESOS,
    ticketMinimoUsd: 20_000,
    fallbacks: { fijo: 'Flip - Panda Zen', variable: 'Flip - Cobra achorada' },
    // El cliente accede al inmobiliario: sin esto la clase se disolveria por
    // la regla del ticket y este fixture no tendria un `inm` que ajustar. Lo
    // que se prueba aca es el camino del ajuste, no esa regla.
    accedeInmobiliario: true,
    ajustes,
    restricciones,
  })
  if (!derivacion.ok) throw new Error(derivacion.bloqueos.map((b) => b.mensaje).join(' · '))
  return generarPlan(derivacion.entrada)
}

describe('los dos portafolios', () => {
  // El caso de la mesa, con el patrimonio de este fixture: al inmobiliario le
  // tocaban 140,000 y el asesor lo clava en 60,000.
  const sistema = planCon([])
  const ajustado = planCon([{ clase: 'inm', modo: 'fijar', montoUsd: 60_000 }])
  const vista = armarDosPortafolios(PARA_LA_VISTA, sistema, ajustado, CATALOGO)

  const fila = (clase: string) => vista.filas.find((f) => f.clase === clase)!

  it('el portafolio del sistema ignora los ajustes', () => {
    expect(fila('inm').sistemaUsd).toBeCloseTo(140_000, 2)
  })

  it('el ajustado los aplica', () => {
    expect(fila('inm').ajustadoUsd).toBeCloseTo(60_000, 2)
    expect(fila('inm').fijada).toBe(true)
    expect(fila('inm').deltaUsd).toBeCloseTo(-80_000, 2)
  })

  it('los dos cuadran contra el mismo patrimonio', () => {
    expect(vista.sistema.totalUsd).toBeCloseTo(PATRIMONIO, 2)
    expect(vista.ajustado.totalUsd).toBeCloseTo(PATRIMONIO, 2)
  })

  it('cuenta el dinero que cambio de clase una sola vez', () => {
    expect(vista.movidoUsd).toBeCloseTo(80_000, 2)
  })

  it('la foto de hoy es la de la ficha, no la de ningun plan', () => {
    expect(vista.hoy.totalUsd).toBeCloseTo(PATRIMONIO, 2)
    expect(fila('cash').hoyUsd).toBeCloseTo(PATRIMONIO, 2)
  })

  describe('un activo agregado', () => {
    const conActivo = planCon([], [
      {
        id: 'r1',
        nombre: 'Acciones MSFT',
        montoUsd: 30_000,
        clase: 'variable',
        productoId: null,
      },
    ])
    const conAgregado = armarDosPortafolios(PARA_LA_VISTA, sistema, conActivo, CATALOGO)

    it('sale como una linea propia del objetivo', () => {
      const variable = conAgregado.filas.find((f) => f.clase === 'variable')!
      expect(variable.ajustadoSub.map((s) => s.etiqueta)).toContain('Acciones MSFT')
      expect(variable.ajustadoSub.find((s) => s.etiqueta === 'Acciones MSFT')?.usd).toBeCloseTo(
        30_000,
        2,
      )
    })

    it('no agranda el patrimonio: sale del mismo dinero', () => {
      expect(conActivo.totalObjetivoUsd).toBeCloseTo(PATRIMONIO, 2)
    })
  })

  describe('sacar una clase del calculo', () => {
    const sinInm = planCon([{ clase: 'inm', modo: 'excluir', montoUsd: 0 }])

    it('la deja en cero y reparte su peso', () => {
      const inm = sinInm.reparto.porClase.find((c) => c.clase === 'inm')!
      expect(inm.objetivoUsd).toBe(0)
      expect(sinInm.totalObjetivoUsd).toBeCloseTo(PATRIMONIO, 2)
    })
  })

  describe('un ajuste que el piso no deja cumplir', () => {
    const conservado: PosicionRevisada[] = [
      { ...POSICIONES[0]!, valorUsd: 500_000, cta: 'venta_total' },
      {
        institucionProducto: 'Casa de playa',
        origen: 'inmueble',
        claseModelo: 'inm',
        productoId: null,
        valorUsd: 200_000,
        esInvertible: true,
        cta: 'conservar',
        montoVentaParcial: 0,
      },
    ]

    const derivacion = armarEntradaPlan(conservado, {
      perfil: 'Moderado',
      benchmark: BENCHMARK,
      pesos: PESOS,
      ticketMinimoUsd: 20_000,
      fallbacks: { fijo: 'Flip - Panda Zen', variable: 'Flip - Cobra achorada' },
      ajustes: [{ clase: 'inm', modo: 'fijar', montoUsd: 60_000 }],
    })
    if (!derivacion.ok) throw new Error('la derivacion tenia que pasar')
    const plan = generarPlan(derivacion.entrada)

    it('clava en el piso, no en lo pedido', () => {
      const inm = plan.reparto.porClase.find((c) => c.clase === 'inm')!
      expect(inm.objetivoUsd).toBeCloseTo(200_000, 2)
    })

    it('lo dice en un aviso, con las dos cifras', () => {
      const aviso = plan.avisos.find((a) => a.includes('Inmobiliario Directo'))
      expect(aviso).toContain('60,000')
      expect(aviso).toContain('200,000')
    })
  })
})
