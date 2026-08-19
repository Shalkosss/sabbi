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

export const guardar = (documento: Documento): Uint8Array =>
  zipSync(documento.entradas as Record<string, Uint8Array>, { level: 6 })
