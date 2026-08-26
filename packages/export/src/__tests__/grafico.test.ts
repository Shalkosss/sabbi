import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'

import { strFromU8, unzipSync } from 'fflate'
import { describe, expect, it } from 'vitest'

import { cajaDe, formasDe } from '../pptx/replica/forma.js'
import {
  ANCHO_BARRA,
  BARRAS,
  BASE_EMU,
  HOLGURA_ETIQUETA,
  PASOS,
  PASO_EMU,
  TOKENS_SEGUNDA_SERIE,
  escalonPara,
  redibujarGrafico,
  tokenDeBarra,
} from '../pptx/replica/grafico.js'

/**
 * El grafico de la lamina 4, contra la lamina de verdad.
 *
 * Como el resto de las pruebas de la replica, corre sobre `template.pptx` y no
 * sobre un fixture: lo que se prueba es que el codigo sepa encontrar y mover
 * las formas que el diseno dibujo, y una lamina de juguete no tendria ninguna.
 *
 * Esto tambien ata las constantes al archivo. Si alguien redibuja la lamina y
 * mueve la linea del cero o cambia el ancho de las barras, estas pruebas fallan
 * en vez de dejar que el deck salga con barras en el lugar equivocado.
 */

const PLANTILLA = new Uint8Array(
  readFileSync(fileURLToPath(new URL('../../pptx/replica/template.pptx', import.meta.url))),
)

const LAMINA = strFromU8(
  unzipSync(PLANTILLA)['ppt/slides/slide4.xml'] ?? new Uint8Array(),
)

/** Las barras del XML, de izquierda a derecha. La misma regla que usa el modulo. */
const barrasDe = (xml: string) =>
  formasDe(xml)
    .filter((forma) => forma.includes('<a:custGeom') && cajaDe(forma).cx === ANCHO_BARRA)
    .map(cajaDe)
    .sort((a, b) => a.x - b.x)

const etiquetaDe = (xml: string, i: number) =>
  formasDe(xml).find((forma) => forma.includes(`{{${tokenDeBarra(i)}}}`))

const rotulosDelEje = (xml: string) =>
  (xml.match(/<a:t>\d+%<\/a:t>/g) ?? []).map((t) => t.replace(/<\/?a:t>/g, ''))

const REPARTO = [0.42, 0.23, 0.15, 0.11, 0.06, 0.03]

describe('la lamina que llega de la plantilla', () => {
  it('trae las seis barras apoyadas en la linea del cero', () => {
    const barras = barrasDe(LAMINA)

    expect(barras).toHaveLength(BARRAS)
    for (const barra of barras) {
      expect(Math.abs(barra.y + barra.cy - BASE_EMU)).toBeLessThanOrEqual(1_000)
    }
  })

  it('tiene el eje equiespaciado en el paso que dice la constante', () => {
    // Las seis lineas se leen de los rotulos, que estan a la izquierda de la
    // primera barra. Si el diseno las moviera, el redibujado quedaria corrido.
    const primera = barrasDe(LAMINA)[0]
    const alturas = formasDe(LAMINA)
      .filter((forma) => {
        const texto = (forma.match(/<a:t>([\s\S]*?)<\/a:t>/g) ?? [])
          .map((t) => t.replace(/<\/?a:t>/g, ''))
          .join('')
        return /^\d+%$/.test(texto) && cajaDe(forma).x < (primera?.x ?? 0)
      })
      .map((forma) => cajaDe(forma).y)
      .sort((a, b) => b - a)

    expect(alturas).toHaveLength(PASOS + 1)
    for (let i = 1; i < alturas.length; i += 1) {
      expect((alturas[i - 1] ?? 0) - (alturas[i] ?? 0)).toBe(PASO_EMU)
    }
  })

  it('trae la segunda serie que no tiene fuente', () => {
    for (const token of TOKENS_SEGUNDA_SERIE) expect(LAMINA).toContain(`{{${token}}}`)
  })
})

describe('redibujarGrafico', () => {
  it('le da a cada barra el alto que le toca por su participacion', () => {
    const { xml, escalon } = redibujarGrafico(LAMINA, REPARTO)
    const barras = barrasDe(xml)

    expect(barras).toHaveLength(BARRAS)
    barras.forEach((barra, i) => {
      expect((barra.cy / PASO_EMU) * escalon).toBeCloseTo(REPARTO[i] ?? 0, 6)
    })
  })

  it('deja todas las barras apoyadas exactamente en el cero', () => {
    const { xml } = redibujarGrafico(LAMINA, REPARTO)

    for (const barra of barrasDe(xml)) expect(barra.y + barra.cy).toBe(BASE_EMU)
  })

  it('pone cada etiqueta sobre su barra, a la holgura del diseno', () => {
    const { xml } = redibujarGrafico(LAMINA, REPARTO)
    const barras = barrasDe(xml)

    barras.forEach((barra, i) => {
      const etiqueta = etiquetaDe(xml, i)
      expect(etiqueta).toBeDefined()
      const caja = cajaDe(etiqueta ?? '')
      expect(barra.y - (caja.y + caja.cy)).toBe(HOLGURA_ETIQUETA)
    })
  })

  it('borra la segunda serie entera: linea, marcadores, etiquetas y leyenda', () => {
    const { xml } = redibujarGrafico(LAMINA, REPARTO)

    for (const token of TOKENS_SEGUNDA_SERIE) expect(xml).not.toContain(`{{${token}}}`)
    expect(xml).not.toContain('{{s04.nombre10}}')

    const conMarcadores = (xml.match(/<p:grpSp>[\s\S]*?<\/p:grpSp>/g) ?? []).filter((g) =>
      g.includes('<p:pic>'),
    )
    expect(conMarcadores).toHaveLength(0)
  })

  it('conserva la leyenda de la serie que si se dibuja', () => {
    const { xml } = redibujarGrafico(LAMINA, REPARTO)

    expect(xml).toContain('{{s04.nombre9}}')
  })

  it('sube el eje cuando una clase no entra en el 50%', () => {
    const { xml, escalon } = redibujarGrafico(LAMINA, [0.7, 0.2, 0.1])

    expect(escalon).toBe(0.2)
    expect(rotulosDelEje(xml)).toEqual(['0%', '20%', '40%', '60%', '80%', '100%'])

    // Y la barra mas alta sigue dentro del area del grafico.
    const mayor = barrasDe(xml)[0]
    expect(mayor?.cy).toBeLessThanOrEqual(PASO_EMU * PASOS)
  })

  it('lo baja cuando todas las clases son chicas, para que se vean', () => {
    const { xml, escalon } = redibujarGrafico(LAMINA, [0.12, 0.08, 0.05])

    expect(escalon).toBe(0.05)
    expect(rotulosDelEje(xml)).toEqual(['0%', '5%', '10%', '15%', '20%', '25%'])
  })

  it('deja en cero las barras de las clases que el cliente no tiene', () => {
    const { xml } = redibujarGrafico(LAMINA, [0.6, 0.4])
    const barras = barrasDe(xml)

    expect(barras.slice(2).every((barra) => barra.cy === 0)).toBe(true)
    expect(barras.slice(2).every((barra) => barra.y === BASE_EMU)).toBe(true)
  })

  it('sigue siendo XML de la misma forma: no pierde ni parte una etiqueta', () => {
    const { xml } = redibujarGrafico(LAMINA, REPARTO)

    const abiertas = (xml.match(/<p:sp>/g) ?? []).length
    const cerradas = (xml.match(/<\/p:sp>/g) ?? []).length
    expect(abiertas).toBe(cerradas)
    expect(xml.startsWith('<?xml')).toBe(true)
    expect(xml.trimEnd().endsWith('</p:sld>')).toBe(true)
  })
})

describe('escalonPara', () => {
  it('elige el primer escalon que cubre la barra mas alta', () => {
    expect(escalonPara([0.42])).toBe(0.1)
    expect(escalonPara([0.5])).toBe(0.1)
    expect(escalonPara([0.51])).toBe(0.2)
    expect(escalonPara([0.12])).toBe(0.05)
  })

  it('mira la mayor y no la suma: el eje tiene que cubrir la barra mas alta', () => {
    expect(escalonPara([0.3, 0.3, 0.3, 0.1])).toBe(0.1)
  })

  it('no se queda sin escalon con un reparto imposible', () => {
    expect(escalonPara([2])).toBe(0.5)
    expect(escalonPara([])).toBe(0.02)
  })
})
