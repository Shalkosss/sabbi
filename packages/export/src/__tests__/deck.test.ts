import { unzipSync, strFromU8 } from 'fflate'
import { describe, expect, it } from 'vitest'

import {
  armarEntradaPlan,
  armarPropuesta,
  generarPlan,
} from '@sabbi/core'
import type { AjusteClase, Benchmark, PosicionPropuesta, Propuesta } from '@sabbi/core'

import { armarDeckRediseno } from '../pptx/rediseno/deck.js'

/**
 * El deck redisenado, armado de punta a punta.
 *
 * Un .pptx es un zip de XML, asi que el test lo abre y lee lo que quedo
 * escrito adentro. No comprueba que se vea bien —eso lo mira una persona— sino
 * lo que si se puede afirmar: que el archivo es un pptx valido, que tiene las
 * laminas que tiene que tener, que las cifras del cliente llegaron a la
 * lamina, y que armar el mismo deck dos veces da el mismo contenido.
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
  fijo: { 'iShares Core Global Aggregate Bond': 1 },
  variable: { 'iShares Core S&P 500 UCITS ETF': 1 },
  otros: { 'IBIT (BTC)': 1 },
}

const POSICIONES: PosicionPropuesta[] = [
  {
    orden: 1,
    institucionProducto: 'Cuenta corriente BCP',
    origen: 'financiero',
    tipoFicha: null,
    assetClass: 'Money Market',
    claseModelo: 'cash',
    productoId: null,
    moneda: 'USD',
    plaza: 'Perú',
    rendimientoEst: 0.01,
    nota: '',
    pais: null,
    pctPertenencia: 1,
    valorDeclaradoUsd: 600_000,
    valorUsd: 600_000,
    uso: null,
    esInvertible: true,
    cta: 'venta_total',
    montoVentaParcial: 0,
  },
  {
    orden: 2,
    institucionProducto: 'Casa de playa',
    origen: 'inmueble',
    tipoFicha: null,
    assetClass: null,
    claseModelo: 'inm',
    productoId: null,
    moneda: 'USD',
    plaza: 'Perú',
    rendimientoEst: 0.04,
    nota: '',
    pais: 'Perú',
    pctPertenencia: 1,
    valorDeclaradoUsd: 200_000,
    valorUsd: 200_000,
    uso: 'Renta',
    esInvertible: true,
    cta: 'conservar',
    montoVentaParcial: 0,
  },
]

function propuestaDe(ajustes: readonly AjusteClase[] = []): Propuesta {
  const comunes = {
    perfil: 'Moderado' as const,
    benchmark: BENCHMARK,
    pesos: PESOS,
    ticketMinimoUsd: 20_000,
    fallbacks: { fijo: 'Flip - Panda Zen', variable: 'Flip - Cobra achorada' },
  }

  const derivacion = armarEntradaPlan(POSICIONES, { ...comunes, ajustes })
  if (!derivacion.ok) throw new Error(derivacion.bloqueos.map((b) => b.mensaje).join(' · '))

  const base = ajustes.length === 0 ? null : armarEntradaPlan(POSICIONES, comunes)

  return armarPropuesta({
    cliente: { nombre: 'Cliente de Prueba', perfil: 'Moderado', mandato: 'Discrecional' },
    posiciones: POSICIONES,
    plan: generarPlan(derivacion.entrada),
    planSistema: base !== null && base.ok ? generarPlan(base.entrada) : null,
    modeloPuro: generarPlan({ ...derivacion.entrada, pisos: [], ajustes: [], inmFijado: false }),
    pisos: derivacion.entrada.pisos,
    benchmark: derivacion.entrada.benchmark,
    parametros: { ticketMinimoUsd: 20_000, colchonLiquidezUsd: 0, fxPenUsd: 3.75 },
  })
}

/** Mediodia UTC del 20 de agosto: en Lima sigue siendo el 20. */
const FECHA = new Date(Date.UTC(2026, 7, 20, 12))

/** El .pptx abierto: cada lamina por su nombre de archivo, ya como texto. */
function abrir(bytes: Uint8Array): Map<string, string> {
  const archivos = unzipSync(bytes)
  const laminas = new Map<string, string>()
  for (const [nombre, contenido] of Object.entries(archivos)) {
    if (/^ppt\/slides\/slide\d+\.xml$/.test(nombre)) laminas.set(nombre, strFromU8(contenido))
  }
  return laminas
}

/** El texto visible de una lamina, sin las etiquetas del XML y sin escapar. */
const texto = (xml: string): string =>
  [...xml.matchAll(/<a:t>([^<]*)<\/a:t>/g)]
    .map((m) => m[1] ?? '')
    .join(' ')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&amp;/g, '&')

const numero = (nombre: string): number => Number(/slide(\d+)\.xml/.exec(nombre)?.[1] ?? 0)

describe('armarDeckRediseno', () => {
  const propuesta = propuestaDe()

  it('produce un .pptx que se puede abrir', async () => {
    const bytes = await armarDeckRediseno(propuesta, { fecha: FECHA })
    const archivos = unzipSync(bytes)

    expect(bytes.byteLength).toBeGreaterThan(10_000)
    expect(Object.keys(archivos)).toContain('ppt/presentation.xml')
    expect(Object.keys(archivos)).toContain('[Content_Types].xml')
  })

  it('arma las laminas de la propuesta, sin la de los dos portafolios', async () => {
    const laminas = abrir(await armarDeckRediseno(propuesta, { fecha: FECHA }))
    // Portada, hoy, comparativo, rentabilidad, dos de objetivo y ejecucion.
    // Notas no sale: esta propuesta no dejo ningun aviso.
    expect(laminas.size).toBe(7)
    expect(propuesta.avisos).toEqual([])
  })

  it('la portada lleva el cliente, su perfil y la fecha que se le pasa', async () => {
    const laminas = abrir(await armarDeckRediseno(propuesta, { fecha: FECHA }))
    const portada = texto(laminas.get('ppt/slides/slide1.xml') ?? '')

    expect(portada).toContain('Cliente de Prueba')
    expect(portada).toContain('Moderado')
    expect(portada).toContain('Discrecional')
    expect(portada).toContain('20 de agosto de 2026')
  })

  it('el patrimonio de la ficha llega a la lamina de hoy', async () => {
    const laminas = abrir(await armarDeckRediseno(propuesta, { fecha: FECHA }))
    expect(texto(laminas.get('ppt/slides/slide2.xml') ?? '')).toContain('800,000')
  })

  it('el objetivo nombra los instrumentos que el motor imprimio', async () => {
    const laminas = abrir(await armarDeckRediseno(propuesta, { fecha: FECHA }))
    const todo = [...laminas.values()].map(texto).join(' ')

    for (const linea of propuesta.seccion6.grupos.flatMap((g) => g.lineas)) {
      expect(todo).toContain(linea.instrumento)
    }
  })

  it('el mismo deck armado dos veces tiene las mismas laminas', async () => {
    const uno = abrir(await armarDeckRediseno(propuesta, { fecha: FECHA }))
    const otro = abrir(await armarDeckRediseno(propuesta, { fecha: FECHA }))

    expect([...otro.entries()]).toStrictEqual([...uno.entries()])
  })

  describe('con ajustes del asesor', () => {
    it('suma la lamina de los dos portafolios', async () => {
      const conAjuste = propuestaDe([{ clase: 'inm', modo: 'fijar', montoUsd: 220_000 }])
      expect(conAjuste.dosPortafolios).not.toBeNull()

      const laminas = abrir(await armarDeckRediseno(conAjuste, { fecha: FECHA }))
      expect(laminas.size).toBe(8)

      const todo = [...laminas.entries()]
        .sort((a, b) => numero(a[0]) - numero(b[0]))
        .map(([, xml]) => texto(xml))
        .join(' ')
      expect(todo).toContain('Los dos portafolios')
      expect(todo).toContain('fijada')
    })
  })

  it('el asesor sale en la portada solo cuando se lo pasa', async () => {
    const con = abrir(await armarDeckRediseno(propuesta, { fecha: FECHA, asesor: 'Ana Asesora' }))
    const sin = abrir(await armarDeckRediseno(propuesta, { fecha: FECHA }))

    expect(texto(con.get('ppt/slides/slide1.xml') ?? '')).toContain('Ana Asesora')
    expect(texto(sin.get('ppt/slides/slide1.xml') ?? '')).not.toContain('Preparado por')
  })
})
