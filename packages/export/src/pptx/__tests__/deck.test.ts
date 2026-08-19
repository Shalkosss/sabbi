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
      grupos: [],
      comparativo: [],
      totalUsd: 1_250_000,
      cuadreUsd: 0,
    },
    seccion7: {
      ventas: [],
      compras: [],
      totalVentasUsd: 0,
      totalComprasUsd: 0,
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
    expect(Object.keys(entradas).filter((r) => r.startsWith('ppt/slides/slide'))).toHaveLength(22)
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

  it('informa que tokens quedaron sin dato, en vez de esconderlo', () => {
    const { resueltos, vacios } = armar()

    expect(resueltos.length).toBeGreaterThan(0)
    // Las comisiones y los scores todavia no tienen fuente en el motor.
    expect(vacios).toContain('s05.score')
    expect(vacios.length).toBeGreaterThan(resueltos.length)
  })
})
