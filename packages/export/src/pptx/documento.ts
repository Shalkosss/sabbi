/**
 * Un .pptx abierto, como diccionario de entradas.
 *
 * El formato es un ZIP de XML: cada lamina es `ppt/slides/slideN.xml` y el
 * resto —tipografias, imagenes, relaciones— viaja intacto. Trabajar sobre el
 * XML en crudo, y no sobre un modelo de objetos, es deliberado: la plantilla
 * ya trae el diseno resuelto y lo unico que se toca son los textos tokenizados
 * y el ancho de unas barras. Cuanto menos se reescribe, menos se rompe.
 */
import { unzipSync, zipSync } from 'fflate'

const DECODER = new TextDecoder('utf-8')
const ENCODER = new TextEncoder()

/** `ppt/slides/slide12.xml` -> 12. Cualquier otra entrada, `null`. */
function numeroDeLamina(ruta: string): number | null {
  const coincidencia = /^ppt\/slides\/slide(\d+)\.xml$/.exec(ruta)
  return coincidencia === null ? null : Number(coincidencia[1])
}

export interface Documento {
  /** Todas las entradas del ZIP, por ruta. Las que no son lamina no se tocan. */
  readonly entradas: Record<string, Uint8Array>
  /** Numeros de lamina presentes, en orden de presentacion. */
  readonly laminas: readonly number[]
}

export function abrir(bytes: Uint8Array): Documento {
  const entradas = unzipSync(bytes)

  const laminas = Object.keys(entradas)
    .map(numeroDeLamina)
    .filter((n): n is number => n !== null)
    .sort((a, b) => a - b)

  if (laminas.length === 0) {
    throw new Error('El archivo no parece un .pptx: no tiene ninguna lamina en ppt/slides/.')
  }

  return { entradas, laminas }
}

export const rutaDeLamina = (n: number): string => `ppt/slides/slide${n}.xml`

export function leerLamina(documento: Documento, n: number): string {
  const bytes = documento.entradas[rutaDeLamina(n)]
  if (bytes === undefined) throw new Error(`La lamina ${n} no existe en la plantilla.`)
  return DECODER.decode(bytes)
}

export function escribirLamina(documento: Documento, n: number, xml: string): Documento {
  return {
    ...documento,
    entradas: { ...documento.entradas, [rutaDeLamina(n)]: ENCODER.encode(xml) },
  }
}

const RELACIONES = 'ppt/_rels/presentation.xml.rels'
const PRESENTACION = 'ppt/presentation.xml'
const TIPOS = '[Content_Types].xml'

/** El `rId` con el que la presentacion referencia a una lamina. */
function idDeRelacion(rels: string, n: number): string | null {
  const patron = new RegExp(
    `<Relationship[^>]*Id="([^"]+)"[^>]*Target="(?:\\./)?slides/slide${n}\\.xml"`,
  )
  const directo = patron.exec(rels)
  if (directo !== null) return directo[1] as string

  // El orden de los atributos no esta garantizado por el formato.
  const inverso = new RegExp(
    `<Relationship[^>]*Target="(?:\\./)?slides/slide${n}\\.xml"[^>]*Id="([^"]+)"`,
  ).exec(rels)
  return inverso === null ? null : (inverso[1] as string)
}

/**
 * Saca laminas de la presentacion, y del archivo.
 *
 * Se borra todo rastro: la entrada en la lista de laminas, la relacion que la
 * referencia, el XML de la lamina, sus propias relaciones y su declaracion de
 * tipo. Dejar la parte huerfana seria valido en OPC y PowerPoint la ignoraria,
 * pero el archivo viajaria con laminas invisibles que traen el layout —y los
 * tokens sin resolver— de otro cliente. Un deck que se manda por correo no
 * puede llevar eso adentro.
 */
export function eliminarLaminas(
  documento: Documento,
  numeros: readonly number[],
): Documento {
  if (numeros.length === 0) return documento

  let rels = DECODER.decode(documento.entradas[RELACIONES] as Uint8Array)
  let presentacion = DECODER.decode(documento.entradas[PRESENTACION] as Uint8Array)
  let tipos = DECODER.decode(documento.entradas[TIPOS] as Uint8Array)

  const entradas = { ...documento.entradas }

  for (const n of numeros) {
    const rId = idDeRelacion(rels, n)
    if (rId === null) continue

    presentacion = presentacion.replace(new RegExp(`<p:sldId[^>]*r:id="${rId}"[^>]*/>`), '')
    rels = rels.replace(new RegExp(`<Relationship[^>]*Id="${rId}"[^>]*/>`), '')
    tipos = tipos.replace(
      new RegExp(`<Override[^>]*PartName="/ppt/slides/slide${n}\\.xml"[^>]*/>`),
      '',
    )

    delete entradas[rutaDeLamina(n)]
    delete entradas[`ppt/slides/_rels/slide${n}.xml.rels`]
  }

  const quitadas = new Set(numeros)

  return {
    entradas: {
      ...entradas,
      [RELACIONES]: ENCODER.encode(rels),
      [PRESENTACION]: ENCODER.encode(presentacion),
      [TIPOS]: ENCODER.encode(tipos),
    },
    laminas: documento.laminas.filter((n) => !quitadas.has(n)),
  }
}

export const guardar = (documento: Documento): Uint8Array =>
  zipSync(documento.entradas as Record<string, Uint8Array>, { level: 6 })
