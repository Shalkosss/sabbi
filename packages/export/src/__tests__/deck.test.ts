import { unzipSync, strFromU8 } from 'fflate'
import { describe, expect, it } from 'vitest'

import { armarDeckRediseno } from '../pptx/rediseno/deck.js'
import { propuestaDeEjemplo as propuestaDe } from './propuesta-de-ejemplo.js'

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

  it('el asesor sale en la portada solo cuando se lo pasa', async () => {
    const con = abrir(await armarDeckRediseno(propuesta, { fecha: FECHA, asesor: 'Ana Asesora' }))
    const sin = abrir(await armarDeckRediseno(propuesta, { fecha: FECHA }))

    expect(texto(con.get('ppt/slides/slide1.xml') ?? '')).toContain('Ana Asesora')
    expect(texto(sin.get('ppt/slides/slide1.xml') ?? '')).not.toContain('Preparado por')
  })
})
