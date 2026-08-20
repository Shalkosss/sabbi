import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'

import type { Propuesta } from '@sabbi/core'
import { unzipSync } from 'fflate'
import { describe, expect, it } from 'vitest'

import { armarDeck } from '../deck.js'

/**
 * El deck se arma contra la plantilla real, no contra un .pptx de mentira.
 *
 * Es la unica forma de que el test conteste la pregunta que importa: si el
 * archivo que baja el asesor abre en PowerPoint. Una plantilla sintetica
 * validaria el codigo y no el resultado.
 */
const PLANTILLA = fileURLToPath(
  new URL('../../../pptx/replica/template.pptx', import.meta.url),
)

/** Lo minimo que la propuesta tiene que traer para que el mapeo corra. */
function propuestaDePrueba(): Propuesta {
  return {
    cliente: { nombre: 'Fernando Pastor', perfil: 'Moderado', mandato: 'Crecimiento' },
    seccion1: { filas: [], totalUsd: 1_250_000 },
    seccion2: { filas: [], totalUsd: 400_000 },
    seccion3: {
      filas: [
        { assetClass: 'Renta Fija', valorUsd: 500_000, share: 0.4, seConservaUsd: 500_000, seVendeUsd: 0 },
        { assetClass: 'Renta Variable', valorUsd: 375_000, share: 0.3, seConservaUsd: 375_000, seVendeUsd: 0 },
        { assetClass: 'Mercados Privados', valorUsd: 250_000, share: 0.2, seConservaUsd: 250_000, seVendeUsd: 0 },
        { assetClass: 'Liquidez', valorUsd: 125_000, share: 0.1, seConservaUsd: 125_000, seVendeUsd: 0 },
      ],
      totalUsd: 1_250_000,
    },
    seccion4: { filas: [], totalUsd: 1_250_000 },
    seccion5: { porMoneda: [], porPlaza: [] },
    seccion6: {
      parametros: {
        ticketFinancieroTotalUsd: 1_250_000,
        montoAReinvertirUsd: 0,
        fxPenUsd: 3.75,
        colchonLiquidezUsd: 0,
        pctModeloInmobiliario: 0,
        baseRedistribucionUsd: 1_250_000,
      },
      // Dos grupos con dos lineas cada uno: seis filas, una sola lamina.
      grupos: [
        {
          clase: 'fijo',
          objetivoUsd: 700_000,
          share: 0.56,
          cerrada: false,
          lineas: [
            {
              instrumento: 'ETF global agregado',
              usd: 450_000,
              share: 0.36,
              conservada: false,
              retornoTotal: { min: 0.042, max: 0.055 },
              retornoDistributivo: null,
              distribucionAnualUsd: null,
              moneda: 'USD',
              nota: 'Deuda global grado de inversión',
            },
            {
              instrumento: 'Bono corporativo local',
              usd: 250_000,
              share: 0.2,
              conservada: true,
              retornoTotal: null,
              retornoDistributivo: null,
              distribucionAnualUsd: null,
              moneda: 'PEN',
              nota: null,
            },
          ],
        },
        {
          clase: 'variable',
          objetivoUsd: 550_000,
          share: 0.44,
          cerrada: false,
          lineas: [
            {
              instrumento: 'ETF mundo desarrollado',
              usd: 400_000,
              share: 0.32,
              conservada: false,
              retornoTotal: { min: 0.07, max: 0.09 },
              retornoDistributivo: null,
              distribucionAnualUsd: null,
              moneda: 'USD',
              nota: null,
            },
            {
              instrumento: 'ETF mercados emergentes',
              usd: 150_000,
              share: 0.12,
              conservada: false,
              retornoTotal: null,
              retornoDistributivo: null,
              distribucionAnualUsd: null,
              moneda: 'USD',
              nota: null,
            },
          ],
        },
      ],
      comparativo: [],
      totalUsd: 1_250_000,
      cuadreUsd: 0,
    },
    seccion7: {
      // Cuatro ventas para tres slots: la lamina muestra las mayores.
      ventas: [
        { instrumento: 'Depósito a plazo BCP', accion: 'Venta total', usd: 200_000 },
        { instrumento: 'Bono soberano PEN', accion: 'Venta parcial', usd: 120_000 },
        { instrumento: 'Fondo mutuo local', accion: 'Venta total', usd: 60_000 },
        { instrumento: 'Acción individual', accion: 'Venta total', usd: 20_000 },
      ],
      compras: [
        { instrumento: 'ETF global agregado', clase: 'fijo', usd: 250_000 },
        { instrumento: 'ETF mundo desarrollado', clase: 'variable', usd: 100_000 },
        { instrumento: 'Fondo Oportunidad', clase: 'privados', usd: 50_000 },
      ],
      totalVentasUsd: 400_000,
      totalComprasUsd: 400_000,
      cuadreUsd: 0,
    },
    avisos: [],
  }
}

const armar = () =>
  armarDeck(readFileSync(PLANTILLA), propuestaDePrueba(), {
    emitido: new Date('2026-08-19T12:00:00Z'),
  })

/** El texto de una lamina, sin etiquetas XML. */
function textoDeLamina(archivo: Uint8Array, n: number): string {
  const entradas = unzipSync(archivo)
  const xml = new TextDecoder().decode(entradas[`ppt/slides/slide${n}.xml`] as Uint8Array)
  return xml.replace(/<[^>]+>/g, '')
}

describe('armarDeck', () => {
  it('devuelve un .pptx que se puede volver a abrir', () => {
    const { archivo } = armar()
    const entradas = unzipSync(archivo)

    expect(entradas['[Content_Types].xml']).toBeDefined()
    expect(entradas['ppt/presentation.xml']).toBeDefined()
    // 22 en la plantilla, menos las dos laminas de anexo que no hicieron falta.
    expect(
      Object.keys(entradas).filter((r) => /^ppt\/slides\/slide\d+\.xml$/.test(r)),
    ).toHaveLength(20)
  })

  it('no deja ningun token sin resolver en el archivo final', () => {
    const { archivo } = armar()
    const entradas = unzipSync(archivo)

    for (const [ruta, bytes] of Object.entries(entradas)) {
      if (!ruta.startsWith('ppt/slides/slide')) continue
      expect(new TextDecoder().decode(bytes)).not.toMatch(/\{\{[a-zA-Z0-9._]+\}\}/)
    }
  })

  it('escribe el nombre del cliente y la fecha en la portada', () => {
    const texto = textoDeLamina(armar().archivo, 1)

    expect(texto).toContain('Fernando Pastor')
    expect(texto).toContain('19/08/2026')
  })

  it('escribe los totales y la distribucion por asset class en la lamina 4', () => {
    const texto = textoDeLamina(armar().archivo, 4)

    // Patrimonio total = financiero + uso propio; invertido = solo financiero.
    expect(texto).toContain('$1,650,000')
    expect(texto).toContain('$1,250,000')
    expect(texto).toContain('Moderado')
    expect(texto).toContain('Renta Fija')
    expect(texto).toContain('40%')
  })

  it('lleva el blotter a la lamina 10, con las mayores primero', () => {
    const texto = textoDeLamina(armar().archivo, 10)

    expect(texto).toContain('$400,000')
    expect(texto).toContain('Depósito a plazo BCP')
    expect(texto).toContain('ETF global agregado')
    // 250.000 sobre 400.000 de compras.
    expect(texto).toContain('63%')
    // La cuarta venta no entra: solo hay tres slots y es la menor.
    expect(texto).not.toContain('Acción individual')
  })

  it('genera el anexo con una fila por instrumento, agrupado por clase', () => {
    const texto = textoDeLamina(armar().archivo, 20)

    expect(texto).toContain('Renta Fija')
    expect(texto).toContain('Renta Variable')
    expect(texto).toContain('ETF global agregado')
    expect(texto).toContain('ETF mercados emergentes')
    expect(texto).toContain('Deuda global grado de inversión')
    // El retorno estimado sale como rango, con guion largo.
    expect(texto).toContain('4.2–5.5%')
    expect(texto).toContain('Retorno est.')
  })

  it('saca del archivo las laminas de anexo que no se usan', () => {
    const { archivo, eliminadas, excedente } = armar()

    // Seis filas entran en una sola lamina: sobran la 21 y la 22.
    expect(eliminadas).toEqual([21, 22])
    expect(excedente).toBe(0)

    const entradas = unzipSync(archivo)
    const rels = new TextDecoder().decode(
      entradas['ppt/_rels/presentation.xml.rels'] as Uint8Array,
    )

    expect(rels).toContain('slides/slide20.xml')
    expect(rels).not.toContain('slides/slide21.xml')
    expect(rels).not.toContain('slides/slide22.xml')
  })

  it('informa que tokens quedaron sin dato, en vez de esconderlo', () => {
    const { resueltos, vacios } = armar()

    expect(resueltos.length).toBeGreaterThan(0)
    // Las comisiones y los scores todavia no tienen fuente en el motor.
    expect(vacios).toContain('s05.score')
    expect(vacios.length).toBeGreaterThan(resueltos.length)
  })
})
