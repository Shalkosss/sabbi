import { strFromU8, strToU8, unzipSync, zipSync } from 'fflate'

import { escapar } from './xml.js'

/**
 * El motor de la plantilla del deck replica.
 *
 * Un .pptx es un zip de XML, y esta plantilla ya viene tokenizada: cada valor
 * del cliente fue reemplazado por un `{{token}}` que nunca queda partido entre
 * dos runs. Rellenarla es, para esas laminas, sustituir cadenas — y este modulo
 * es lo unico que hace falta para eso, sin dependencias nuevas: `fflate` ya
 * estaba en el monorepo para leer los .xlsx.
 *
 * Hace dos cosas mas que sustituir, y las dos importan.
 *
 * Deja fuera las laminas que se le pidan. La plantilla trae 22 y no todas
 * tienen de donde sacar su dato todavia; un deck de seis laminas correctas es
 * util y uno de veintidos con holes no lo es.
 *
 * Y devuelve los tokens que nadie resolvio, en vez de dejarlos impresos. Un
 * `{{s05.score}}` en una lamina delante de un cliente es peor que un espacio en
 * blanco, y peor todavia es que el que arma el deck no se entere.
 *
 * Lo que este modulo NO hace es clonar filas ni laminas. Las laminas de
 * posiciones de la plantilla son tablas de largo fijo — `nombre1` a `nombre14`
 * — y un cliente con veinte posiciones necesita filas nuevas, no ranuras
 * vacias. Eso es el siguiente paso y esta escrito en el README.
 */

const RUTA_PRESENTACION = 'ppt/presentation.xml'
const RUTA_RELS = 'ppt/_rels/presentation.xml.rels'
const RUTA_TIPOS = '[Content_Types].xml'

const rutaDeLamina = (numero: number) => `ppt/slides/slide${numero}.xml`
const rutaDeRels = (numero: number) => `ppt/slides/_rels/slide${numero}.xml.rels`

/** Cualquier `{{loQueSea}}` que la plantilla traiga. */
const TOKEN = /\{\{([^{}]+)\}\}/g

/**
 * La fecha que llevan las entradas del zip.
 *
 * Fija, para que el mismo deck armado dos veces de el mismo archivo. Un valor
 * cualquiera no sirve: el zip no sabe escribir nada anterior a 1980 y la fecha
 * se convierte en hora local, asi que el 1 de enero de 1980 se cae del rango en
 * cualquier huso al oeste de Greenwich — Lima, sin ir mas lejos.
 */
const EPOCA_ZIP = new Date(Date.UTC(2000, 0, 1, 12))

export interface ResultadoReplica {
  readonly bytes: Uint8Array
  /** Las laminas que quedaron, numeradas como en la plantilla original. */
  readonly laminas: readonly number[]
  /**
   * Tokens que ninguna fuente resolvio.
   *
   * Quedaron en blanco en el archivo. Que la lista vuelva vacia es la unica
   * forma de saber que el deck salio entero.
   */
  readonly sinFuente: readonly string[]
}

export interface OpcionesReplica {
  /**
   * Que laminas salen, en numeracion de la plantilla y en el orden en que se
   * las pida.
   *
   * Sin esto van todas, en el orden de la plantilla. Repetir un numero saca esa
   * lamina tantas veces: es asi como una tabla que no entra en una se reparte
   * en tres, y cada copia se distingue por el `ocurrencia` que recibe
   * `transformar`.
   */
  readonly laminas?: readonly number[]
  /**
   * Retoque del XML de una lamina antes de sustituir sus tokens.
   *
   * Es por donde entra el clonado de filas: la lamina llega entera, se le
   * rehace la tabla con tantas filas como el cliente tenga, y lo que quede de
   * la plantilla —titulos, pies— lo resuelve la sustitucion despues. Devolver
   * el XML tal como llego es no hacer nada.
   *
   * `ocurrencia` cuenta desde cero cual copia de esa lamina es, para cuando la
   * tabla no entra en una y se pide la misma lamina varias veces.
   */
  readonly transformar?: (numero: number, xml: string, ocurrencia: number) => string
}

/**
 * Las laminas de la plantilla, en el orden en que se ven.
 *
 * Sale de `sldIdLst`, no de como se llaman los archivos: el orden de la
 * presentacion y la numeracion de las partes coinciden hoy, pero nada en el
 * formato lo obliga y guiarse por el nombre del archivo es la clase de atajo
 * que funciona hasta que alguien reordena una lamina en PowerPoint.
 */
export function laminasDe(plantilla: Uint8Array): readonly number[] {
  const partes = unzipSync(plantilla)
  return ordenDeLaminas(leer(partes, RUTA_PRESENTACION), leer(partes, RUTA_RELS))
}

/** Los tokens que la plantilla trae, por lamina. */
export function tokensDe(plantilla: Uint8Array): ReadonlyMap<number, readonly string[]> {
  const partes = unzipSync(plantilla)
  const orden = ordenDeLaminas(leer(partes, RUTA_PRESENTACION), leer(partes, RUTA_RELS))

  return new Map(
    orden.map((numero) => {
      const xml = leer(partes, rutaDeLamina(numero))
      const encontrados = [...xml.matchAll(TOKEN)].map((m) => m[1] ?? '')
      return [numero, [...new Set(encontrados)]]
    }),
  )
}

export function renderizarReplica(
  plantilla: Uint8Array,
  valores: ReadonlyMap<string, string>,
  opciones: OpcionesReplica = {},
): ResultadoReplica {
  const partes = unzipSync(plantilla)
  const presentacion = leer(partes, RUTA_PRESENTACION)
  const rels = leer(partes, RUTA_RELS)

  const orden = ordenDeLaminas(presentacion, rels)
  const pedidas = opciones.laminas === undefined ? orden : opciones.laminas

  const desconocida = pedidas.find((numero) => !orden.includes(numero))
  if (desconocida !== undefined) {
    throw new Error(
      `La plantilla no tiene la lamina ${desconocida}; trae ${orden.length}: ${orden.join(', ')}.`,
    )
  }

  // Una lamina pedida dos veces sale dos veces: es asi como una tabla que no
  // entra en una se reparte en tres. La copia es una parte nueva del paquete,
  // con su propio archivo de relaciones.
  let siguienteParte = Math.max(0, ...orden) + 1
  const vistas = new Set<number>()
  const salida = pedidas.map((numero, indice) => {
    const ocurrencia = pedidas.slice(0, indice).filter((otra) => otra === numero).length
    if (!vistas.has(numero)) {
      vistas.add(numero)
      return { numero, ocurrencia, parte: numero }
    }
    const copia = siguienteParte
    siguienteParte += 1
    partes[rutaDeLamina(copia)] = partes[rutaDeLamina(numero)] ?? new Uint8Array()
    const relsDeLamina = partes[rutaDeRels(numero)]
    if (relsDeLamina !== undefined) {
      partes[rutaDeRels(copia)] = strToU8(sinNotas(strFromU8(relsDeLamina)))
    }
    return { numero, ocurrencia, parte: copia }
  })

  const sinFuente = new Set<string>()

  for (const { numero, ocurrencia, parte } of salida) {
    const ruta = rutaDeLamina(parte)
    const original = leer(partes, ruta)
    const retocada = opciones.transformar?.(numero, original, ocurrencia) ?? original
    partes[ruta] = strToU8(sustituir(retocada, valores, sinFuente))
  }

  const usadas = new Set(salida.map((l) => l.parte))
  for (const numero of orden) {
    if (usadas.has(numero)) continue
    delete partes[rutaDeLamina(numero)]
    delete partes[rutaDeRels(numero)]
  }

  partes[RUTA_PRESENTACION] = strToU8(
    rehacerLista(
      presentacion,
      salida.map((l) => l.parte),
    ),
  )
  partes[RUTA_RELS] = strToU8(
    rehacerRelaciones(
      rels,
      salida.map((l) => l.parte),
    ),
  )
  partes[RUTA_TIPOS] = strToU8(
    rehacerTipos(leer(partes, RUTA_TIPOS), [...usadas]),
  )

  return {
    bytes: zipSync(partes, { mtime: EPOCA_ZIP }),
    laminas: salida.map((l) => l.numero),
    sinFuente: [...sinFuente].sort(),
  }
}

// ── Adentro del paquete ─────────────────────────────────────────────────────

function leer(partes: Record<string, Uint8Array>, ruta: string): string {
  const parte = partes[ruta]
  if (parte === undefined) throw new Error(`La plantilla no trae ${ruta}.`)
  return strFromU8(parte)
}

function ordenDeLaminas(presentacion: string, rels: string): readonly number[] {
  const destino = new Map(
    [...rels.matchAll(/<Relationship Id="([^"]+)"[^>]*Target="slides\/slide(\d+)\.xml"/g)].map(
      (m) => [m[1] ?? '', Number(m[2])],
    ),
  )

  return [...presentacion.matchAll(/<p:sldId [^>]*r:id="([^"]+)"\s*\/>/g)].flatMap((m) => {
    const numero = destino.get(m[1] ?? '')
    return numero === undefined ? [] : [numero]
  })
}

/**
 * Reemplaza los tokens y anota los que quedaron sin fuente.
 *
 * El valor se escapa antes de entrar: un nombre con `&` o `<` — «Ferreyros &
 * Cia», una nota con un `<` — rompe el XML y PowerPoint se niega a abrir el
 * archivo entero, no la lamina.
 */
function sustituir(
  xml: string,
  valores: ReadonlyMap<string, string>,
  sinFuente: Set<string>,
): string {
  return xml.replace(TOKEN, (_completo, token: string) => {
    const valor = valores.get(token)
    if (valor === undefined) {
      sinFuente.add(token)
      return ''
    }
    return escapar(valor)
  })
}


/**
 * Le saca a una copia su hoja de notas.
 *
 * Una hoja de notas pertenece a una sola lamina y apunta de vuelta a ella. Dos
 * laminas reclamando la misma dejan el paquete invalido, y PowerPoint no avisa
 * cual es el problema: se niega a abrir el archivo. Las notas de orador no son
 * parte de la propuesta, asi que la copia va sin ellas.
 */
function sinNotas(rels: string): string {
  return rels.replace(/<Relationship [^>]*\/>/g, (completo) =>
    /relationships\/notesSlide"/.test(completo) ? '' : completo,
  )
}

/** El identificador de relacion que cada lamina de la salida va a llevar. */
const relDeSalida = (indice: number) => `rIdSabbi${indice + 1}`

/**
 * Rehace `sldIdLst`, que es lo que decide que laminas se ven y en que orden.
 *
 * Se escribe entera en vez de ir borrando entradas: con laminas repetidas la
 * lista de salida ya no es un subconjunto de la de entrada, y editarla a
 * parches deja identificadores duplicados que PowerPoint no perdona.
 */
function rehacerLista(presentacion: string, partesEnOrden: readonly number[]): string {
  const entradas = partesEnOrden
    .map((_parte, indice) => `<p:sldId id="${256 + indice}" r:id="${relDeSalida(indice)}"/>`)
    .join('')

  return presentacion.replace(
    /<p:sldIdLst>[\s\S]*?<\/p:sldIdLst>/,
    `<p:sldIdLst>${entradas}</p:sldIdLst>`,
  )
}

/**
 * Rehace las relaciones de la presentacion con sus laminas.
 *
 * Las que no son laminas —el master, el tema, el tamano de la nota— se dejan
 * intactas: son las que sostienen el diseno.
 */
function rehacerRelaciones(rels: string, partesEnOrden: readonly number[]): string {
  const TIPO = 'http://schemas.openxmlformats.org/officeDocument/2006/relationships/slide'

  const sinLaminas = rels.replace(/<Relationship [^>]*\/>/g, (completo) =>
    /Target="slides\/slide\d+\.xml"/.test(completo) ? '' : completo,
  )

  const nuevas = partesEnOrden
    .map(
      (parte, indice) =>
        `<Relationship Id="${relDeSalida(indice)}" Type="${TIPO}" Target="slides/slide${parte}.xml"/>`,
    )
    .join('')

  return sinLaminas.replace('</Relationships>', `${nuevas}</Relationships>`)
}

/**
 * Deja un `Override` por cada lamina que quedo en el paquete.
 *
 * Sin el, PowerPoint no sabe que tipo de parte es y se niega a abrir el
 * archivo; con uno de mas, apuntando a una parte que ya no existe, tampoco.
 */
function rehacerTipos(tipos: string, usadas: readonly number[]): string {
  const TIPO =
    'application/vnd.openxmlformats-officedocument.presentationml.slide+xml'

  const sinLaminas = tipos.replace(/<Override [^>]*\/>/g, (completo) =>
    /PartName="\/ppt\/slides\/slide\d+\.xml"/.test(completo) ? '' : completo,
  )

  const nuevos = [...usadas]
    .sort((a, b) => a - b)
    .map(
      (parte) =>
        `<Override PartName="/ppt/slides/slide${parte}.xml" ContentType="${TIPO}"/>`,
    )
    .join('')

  return sinLaminas.replace('</Types>', `${nuevos}</Types>`)
}
