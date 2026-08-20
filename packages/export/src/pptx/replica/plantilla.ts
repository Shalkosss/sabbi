import { strFromU8, strToU8, unzipSync, zipSync } from 'fflate'

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
   * Que laminas conservar, en numeracion de la plantilla.
   *
   * Sin esto van todas. El orden no se puede cambiar: la plantilla es un
   * documento de diseno y reordenarlo es rehacerlo.
   */
  readonly laminas?: readonly number[]
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

  const conservadas = orden.filter((numero) => pedidas.includes(numero))
  const sinFuente = new Set<string>()

  for (const numero of conservadas) {
    const ruta = rutaDeLamina(numero)
    partes[ruta] = strToU8(sustituir(leer(partes, ruta), valores, sinFuente))
  }

  for (const numero of orden) {
    if (conservadas.includes(numero)) continue
    delete partes[rutaDeLamina(numero)]
    delete partes[rutaDeRels(numero)]
  }

  const fuera = orden.filter((numero) => !conservadas.includes(numero))
  if (fuera.length > 0) {
    partes[RUTA_PRESENTACION] = strToU8(quitarDeLaLista(presentacion, rels, fuera))
    partes[RUTA_RELS] = strToU8(quitarRelaciones(rels, fuera))
    partes[RUTA_TIPOS] = strToU8(quitarTipos(leer(partes, RUTA_TIPOS), fuera))
  }

  return {
    bytes: zipSync(partes, { mtime: EPOCA_ZIP }),
    laminas: conservadas,
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

const escapar = (texto: string): string =>
  texto
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')

/** Saca las laminas de `sldIdLst`, que es lo que decide que ve el que abre. */
function quitarDeLaLista(
  presentacion: string,
  rels: string,
  fuera: readonly number[],
): string {
  const relDe = new Map(
    [...rels.matchAll(/<Relationship Id="([^"]+)"[^>]*Target="slides\/slide(\d+)\.xml"/g)].map(
      (m) => [Number(m[2]), m[1] ?? ''],
    ),
  )
  const rIds = new Set(fuera.flatMap((numero) => [relDe.get(numero) ?? '']))

  return presentacion.replace(/<p:sldId [^>]*r:id="([^"]+)"\s*\/>/g, (completo, rId: string) =>
    rIds.has(rId) ? '' : completo,
  )
}

function quitarRelaciones(rels: string, fuera: readonly number[]): string {
  const rutas = new Set(fuera.map((numero) => `slides/slide${numero}.xml`))

  return rels.replace(/<Relationship [^>]*\/>/g, (completo) => {
    const destino = /Target="([^"]+)"/.exec(completo)?.[1]
    return destino !== undefined && rutas.has(destino) ? '' : completo
  })
}

function quitarTipos(tipos: string, fuera: readonly number[]): string {
  const partes = new Set(fuera.map((numero) => `/ppt/slides/slide${numero}.xml`))

  return tipos.replace(/<Override [^>]*\/>/g, (completo) => {
    const nombre = /PartName="([^"]+)"/.exec(completo)?.[1]
    return nombre !== undefined && partes.has(nombre) ? '' : completo
  })
}
