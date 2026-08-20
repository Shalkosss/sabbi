import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'

import { strFromU8, unzipSync } from 'fflate'
import { describe, expect, it } from 'vitest'

import { armarDeckReplica } from '../pptx/replica/deck.js'
import { LAMINAS_LISTAS, MAPA } from '../pptx/replica/mapa.js'
import { laminasDe, renderizarReplica, tokensDe } from '../pptx/replica/plantilla.js'
import { propuestaDeEjemplo } from './propuesta-de-ejemplo.js'

/**
 * El motor de la plantilla, contra la plantilla de verdad.
 *
 * No hay fixture: se corre sobre `template.pptx`, que esta versionado. Es lo
 * unico que prueba algo — una plantilla de juguete no reproduce el `sldIdLst`,
 * ni los `Override` del content types, ni las relaciones, que es exactamente
 * donde un .pptx queda corrupto sin avisar.
 *
 * El archivo no trae datos de nadie: los valores del cliente de origen viven en
 * el `token-map.json`, que no se versiona.
 */

const PLANTILLA = new Uint8Array(
  readFileSync(fileURLToPath(new URL('../../pptx/replica/template.pptx', import.meta.url))),
)

const partesDe = (bytes: Uint8Array) => unzipSync(bytes)

const texto = (bytes: Uint8Array, ruta: string): string =>
  strFromU8(partesDe(bytes)[ruta] ?? new Uint8Array())

describe('la plantilla del deck replica', () => {
  it('trae las 22 laminas del deck de referencia', () => {
    expect(laminasDe(PLANTILLA)).toEqual([...Array(22).keys()].map((i) => i + 1))
  })

  it('sus tokens estan repartidos por lamina y llevan el prefijo de la suya', () => {
    const tokens = tokensDe(PLANTILLA)

    expect(tokens.get(1)).toContain('s01.nombre')
    expect(tokens.get(2)).toEqual([])

    // Un token siempre nombra la lamina donde vive, salvo el de paginacion,
    // que es del pie y se repite en las seis laminas de patrimonio.
    for (const [numero, propios] of tokens) {
      for (const token of propios) {
        if (token.startsWith('pag.')) continue
        expect(token).toMatch(new RegExp(`^s${String(numero).padStart(2, '0')}\\.`))
      }
    }
  })

  describe('rellenar', () => {
    const valores = new Map([
      ['s01.nombre', 'Ana Tumi Quispe'],
      ['s01.fecha', '20/08/2026'],
    ])

    it('reemplaza el token por su valor', () => {
      const { bytes } = renderizarReplica(PLANTILLA, valores, { laminas: [1] })
      const lamina = texto(bytes, 'ppt/slides/slide1.xml')

      expect(lamina).toContain('Ana Tumi Quispe')
      expect(lamina).toContain('20/08/2026')
      expect(lamina).not.toContain('{{')
    })

    it('deja en blanco lo que ninguna fuente resolvio, y lo dice', () => {
      const { bytes, sinFuente } = renderizarReplica(
        PLANTILLA,
        new Map([['s01.nombre', 'Ana Tumi Quispe']]),
        { laminas: [1] },
      )

      expect(sinFuente).toEqual(['s01.fecha'])
      expect(texto(bytes, 'ppt/slides/slide1.xml')).not.toContain('{{')
    })

    it('escapa el valor: un nombre con ampersand rompia el archivo entero', () => {
      const { bytes } = renderizarReplica(
        PLANTILLA,
        new Map([['s01.nombre', 'Ferreyros & Cia <SAA>']]),
        { laminas: [1] },
      )
      const lamina = texto(bytes, 'ppt/slides/slide1.xml')

      expect(lamina).toContain('Ferreyros &amp; Cia &lt;SAA&gt;')
      expect(lamina).not.toContain('& Cia')
    })
  })

  describe('dejar laminas fuera', () => {
    const { bytes, laminas } = renderizarReplica(PLANTILLA, new Map(), { laminas: [1, 4, 17] })
    const partes = partesDe(bytes)

    it('conserva las pedidas y en el orden de la plantilla', () => {
      expect(laminas).toEqual([1, 4, 17])
    })

    it('borra la parte de las demas y su archivo de relaciones', () => {
      expect(Object.keys(partes)).toContain('ppt/slides/slide4.xml')
      expect(Object.keys(partes)).not.toContain('ppt/slides/slide5.xml')
      expect(Object.keys(partes)).not.toContain('ppt/slides/_rels/slide5.xml.rels')
    })

    it('las saca de la lista de la presentacion, que es lo que decide que se ve', () => {
      const pres = strFromU8(partes['ppt/presentation.xml'] ?? new Uint8Array())
      expect([...pres.matchAll(/<p:sldId /g)]).toHaveLength(3)
    })

    it('saca su relacion y su tipo de contenido: sin eso el archivo no abre', () => {
      const rels = strFromU8(partes['ppt/_rels/presentation.xml.rels'] ?? new Uint8Array())
      const tipos = strFromU8(partes['[Content_Types].xml'] ?? new Uint8Array())

      expect(rels).not.toContain('slides/slide5.xml')
      expect(tipos).not.toContain('/ppt/slides/slide5.xml')
      expect(tipos).toContain('/ppt/slides/slide4.xml')
    })

    it('no toca nada mas del paquete', () => {
      const original = Object.keys(partesDe(PLANTILLA))
      const quedaron = Object.keys(partes)
      const perdidas = original.filter((parte) => !quedaron.includes(parte))

      // Solo laminas y sus relaciones: ni los masters, ni los temas, ni los
      // medios. Borrar de mas es como una plantilla deja de abrir.
      expect(perdidas.every((parte) => /^ppt\/slides\//.test(parte))).toBe(true)
    })

    it('rechaza una lamina que la plantilla no tiene', () => {
      expect(() => renderizarReplica(PLANTILLA, new Map(), { laminas: [99] })).toThrow(
        /no tiene la lamina 99/,
      )
    })
  })

  it('el mismo render dos veces da el mismo archivo', () => {
    const uno = renderizarReplica(PLANTILLA, new Map([['s01.nombre', 'Ana']]), { laminas: [1] })
    const otro = renderizarReplica(PLANTILLA, new Map([['s01.nombre', 'Ana']]), { laminas: [1] })

    expect(otro.bytes).toStrictEqual(uno.bytes)
  })
})

describe('el mapa de la fase 6', () => {
  /**
   * El mapa dice de donde sale el dato de cada lamina. Estos tests lo atan a la
   * plantilla de verdad: sin ellos el mapa envejece en silencio, que es
   * exactamente lo que le paso al «definir cuales llevan dato, en stand by» que
   * estuvo tres meses en el README.
   */
  const propuesta = propuestaDeEjemplo()
  const FECHA = new Date(Date.UTC(2026, 7, 20, 12))

  it('cubre todas las laminas de la plantilla, sin inventar ninguna', () => {
    expect(MAPA.map((l) => l.numero)).toEqual([...laminasDe(PLANTILLA)])
  })

  it('la que no esta lista dice que le falta', () => {
    for (const lamina of MAPA) {
      if (lamina.estado === 'listo') expect(lamina.falta).toBe('')
      else expect(lamina.falta.length).toBeGreaterThan(20)
    }
  })

  it('una lamina lista sale sin nada pendiente', () => {
    // Se comprueba sobre el archivo, no sobre el mapa de tokens: la lamina del
    // anexo no resuelve sus tokens sino que rehace la tabla entera, y las dos
    // formas de llenar una lamina tienen que dar el mismo resultado — ni un
    // `{{` impreso ni un token en la lista de pendientes.
    for (const lamina of MAPA) {
      if (lamina.estado !== 'listo') continue

      const { bytes, sinFuente } = armarDeckReplica(PLANTILLA, propuesta, {
        fecha: FECHA,
        laminas: [lamina.numero],
      })

      expect(sinFuente, `lamina ${lamina.numero}`).toEqual([])
      for (const [ruta, contenido] of Object.entries(unzipSync(bytes))) {
        if (!/^ppt\/slides\/slide\d+\.xml$/.test(ruta)) continue
        expect(strFromU8(contenido), `lamina ${lamina.numero}`).not.toContain('{{')
      }
    }
  })

  it('el deck sale sin un solo token pendiente', () => {
    const { bytes, laminas, sinFuente } = armarDeckReplica(PLANTILLA, propuesta, { fecha: FECHA })

    expect(sinFuente).toEqual([])
    expect([...new Set(laminas)].sort((a, b) => a - b)).toEqual([...LAMINAS_LISTAS])
    expect(strFromU8(unzipSync(bytes)['ppt/slides/slide1.xml'] ?? new Uint8Array())).toContain(
      propuesta.cliente.nombre,
    )
  })

  describe('el anexo', () => {
    const { bytes, laminas } = armarDeckReplica(PLANTILLA, propuesta, { fecha: FECHA })
    const anexos = Object.entries(unzipSync(bytes))
      .filter(([ruta]) => /^ppt\/slides\/slide\d+\.xml$/.test(ruta))
      .map(([, contenido]) => strFromU8(contenido))
      .filter((xml) => xml.includes('<a:tbl>'))

    it('sale tantas veces como paginas necesite la tabla', () => {
      expect(laminas.filter((n) => n === 20).length).toBe(anexos.length)
      expect(anexos.length).toBeGreaterThan(0)
    })

    it('nombra todos los instrumentos del objetivo', () => {
      // El XML guarda el nombre escapado: un ETF con `&` en el nombre aparece
      // como `&amp;` y comparar en crudo no lo encuentra.
      const escapar = (texto: string) => texto.replace(/&/g, '&amp;').replace(/</g, '&lt;')
      const todo = anexos.join(' ')

      for (const linea of propuesta.seccion6.grupos.flatMap((g) => g.lineas)) {
        expect(todo, linea.instrumento).toContain(escapar(linea.instrumento))
      }
    })

    it('escribe una fila por instrumento y una banda por clase, sin repetir', () => {
      const grupos = propuesta.seccion6.grupos.filter((g) => g.lineas.length > 0)
      const lineas = grupos.reduce((acc, g) => acc + g.lineas.length, 0)
      const filas = anexos.reduce((acc, xml) => acc + (xml.match(/<a:tr h="/g) ?? []).length, 0)

      // Cada pagina repite la cabecera; lo demas es una banda por clase y una
      // fila por instrumento, contadas una sola vez entre todas las paginas.
      expect(filas).toBe(anexos.length + grupos.length + lineas)
    })

    it('cada pagina repite la cabecera', () => {
      for (const xml of anexos) expect(xml).toContain('Plazo m')
    })
  })

  it('forzar una lamina que no esta lista deja sus tokens en blanco y los devuelve', () => {
    const { sinFuente } = armarDeckReplica(PLANTILLA, propuesta, {
      fecha: FECHA,
      laminas: [1, 5],
    })

    expect(sinFuente.length).toBeGreaterThan(0)
    expect(sinFuente.every((token) => token.startsWith('s05.'))).toBe(true)
  })
})

describe('la misma lamina, varias veces', () => {
  /**
   * Pedir una lamina dos veces la saca dos veces. Es como una tabla que no
   * entra en una se reparte en tres, y es tambien donde un .pptx se corrompe
   * sin avisar: PowerPoint no dice que parte esta mal, se niega a abrir el
   * archivo entero.
   */
  const { bytes, laminas } = renderizarReplica(PLANTILLA, new Map(), {
    laminas: [1, 20, 20, 20],
    transformar: (_numero, xml, ocurrencia) => xml.replace('Anexo', `Anexo ${ocurrencia + 1}`),
  })
  const partes = partesDe(bytes)

  it('devuelve la lamina de origen tantas veces como se pidio', () => {
    expect(laminas).toEqual([1, 20, 20, 20])
  })

  it('cada copia es una parte propia del paquete', () => {
    const deLaminas = Object.keys(partes).filter((p) => /^ppt\/slides\/slide\d+\.xml$/.test(p))
    expect(deLaminas).toHaveLength(4)
  })

  it('la lista de la presentacion las nombra a todas, sin repetir identificador', () => {
    const pres = strFromU8(partes['ppt/presentation.xml'] ?? new Uint8Array())
    const ids = [...pres.matchAll(/<p:sldId id="(\d+)" r:id="([^"]+)"\/>/g)]

    expect(ids).toHaveLength(4)
    expect(new Set(ids.map((m) => m[1])).size).toBe(4)
    expect(new Set(ids.map((m) => m[2])).size).toBe(4)
  })

  it('cada lamina tiene su tipo de contenido declarado', () => {
    const tipos = strFromU8(partes['[Content_Types].xml'] ?? new Uint8Array())
    const declarados = [...tipos.matchAll(/PartName="\/ppt\/slides\/(slide\d+\.xml)"/g)].map(
      (m) => m[1],
    )
    const existentes = Object.keys(partes)
      .filter((p) => /^ppt\/slides\/slide\d+\.xml$/.test(p))
      .map((p) => p.split('/').pop())

    expect([...declarados].sort()).toEqual([...existentes].sort())
  })

  it('las copias no se pelean por la hoja de notas del original', () => {
    // Dos laminas reclamando la misma hoja de notas dejan el paquete invalido.
    const conNotas = Object.entries(partes)
      .filter(([ruta]) => /^ppt\/slides\/_rels\//.test(ruta))
      .filter(([, contenido]) => strFromU8(contenido).includes('relationships/notesSlide'))

    expect(conNotas.length).toBeLessThanOrEqual(1)
  })

  it('cada copia recibe su numero de ocurrencia', () => {
    const textos = Object.entries(partes)
      .filter(([ruta]) => /^ppt\/slides\/slide\d+\.xml$/.test(ruta))
      .map(([, contenido]) => strFromU8(contenido))
      .join('')

    for (const n of [1, 2, 3]) expect(textos).toContain(`Anexo ${n}`)
  })
})
