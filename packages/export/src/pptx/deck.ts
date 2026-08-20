/**
 * El deck, de punta a punta: plantilla + propuesta -> archivo .pptx.
 *
 * La plantilla entra como bytes y no se lee del disco aca. El paquete queda
 * sin dependencias del sistema de archivos, que es lo que permite correrlo
 * igual en un test, en un script y en una funcion serverless donde el disco
 * es de solo lectura y la ruta no es la del repositorio.
 */
import type { Propuesta } from '@sabbi/core'

import type { FilaAnexo } from './anexo.js'
import { FILAS_POR_LAMINA, LAMINAS_ANEXO, filasDelAnexo, paginar } from './anexo.js'
import { abrir, eliminarLaminas, escribirLamina, guardar, leerLamina } from './documento.js'
import type { ContextoDeck } from './mapa.js'
import { tokensDePropuesta } from './mapa.js'
import { rellenarLamina } from './rellenar.js'
import { huecosDe, leerTabla, rellenarFila, escribirTabla } from './tabla.js'

export interface ResultadoDeck {
  readonly archivo: Uint8Array
  /** Tokens que se resolvieron con un valor de la propuesta. */
  readonly resueltos: readonly string[]
  /** Tokens que quedaron en blanco por falta de dato. */
  readonly vacios: readonly string[]
  /** Laminas que se sacaron del archivo por no tener contenido. */
  readonly eliminadas: readonly number[]
  /** Instrumentos del anexo que no entraron en ninguna lamina. */
  readonly excedente: number
}

/** Los encabezados de columna que la plantilla dejo tokenizados. */
const ENCABEZADO_ANEXO = ['Retorno est.', 'Plazo mín.']

/** Huecos que tiene una fila de dato del anexo: sus seis columnas. */
const COLUMNAS_ANEXO = 6

interface Moldes {
  readonly encabezado: string
  readonly grupo: string
  readonly dato: string
}

/**
 * Los moldes salen de la propia lamina, no de una constante.
 *
 * Cada lamina del anexo trae su tabla con su formato, y se elige por forma:
 * la fila de grupo es la que tiene un solo hueco, la de dato la que tiene los
 * seis de las columnas. Asi el molde sigue siendo valido si el diseno cambia
 * el orden de las filas.
 */
function moldesDe(filas: readonly string[]): Moldes | null {
  const encabezado = filas[0]
  const grupo = filas.find((f) => huecosDe(f) === 1)
  const dato = filas.find((f) => huecosDe(f) === COLUMNAS_ANEXO)

  if (encabezado === undefined || grupo === undefined || dato === undefined) return null
  return { encabezado, grupo, dato }
}

const renderizar = (moldes: Moldes, fila: FilaAnexo): string =>
  rellenarFila(fila.tipo === 'grupo' ? moldes.grupo : moldes.dato, fila.valores)

export function armarDeck(
  plantilla: Uint8Array,
  propuesta: Propuesta,
  contexto: ContextoDeck,
): ResultadoDeck {
  const valores = tokensDePropuesta(propuesta, contexto)
  const { paginas, excedente } = paginar(filasDelAnexo(propuesta))

  let documento = abrir(plantilla)
  const resueltos: string[] = []
  const vacios: string[] = []
  const eliminadas: number[] = []

  for (const n of documento.laminas) {
    const indiceAnexo = LAMINAS_ANEXO.indexOf(n as (typeof LAMINAS_ANEXO)[number])

    if (indiceAnexo !== -1) {
      const pagina = paginas[indiceAnexo]

      // Una lamina de anexo sin filas no se deja en blanco: se saca.
      if (pagina === undefined) {
        eliminadas.push(n)
        continue
      }

      const tabla = leerTabla(leerLamina(documento, n))
      const moldes = tabla === null ? null : moldesDe(tabla.filas)

      if (tabla !== null && moldes !== null) {
        documento = escribirLamina(
          documento,
          n,
          escribirTabla(tabla, [
            rellenarFila(moldes.encabezado, ENCABEZADO_ANEXO),
            ...pagina.map((fila) => renderizar(moldes, fila)),
          ]),
        )
        resueltos.push(`anexo.lamina${n}`)
        continue
      }
    }

    const relleno = rellenarLamina(leerLamina(documento, n), valores)

    documento = escribirLamina(documento, n, relleno.xml)
    resueltos.push(...relleno.resueltos)
    vacios.push(...relleno.vacios)
  }

  return {
    archivo: guardar(eliminarLaminas(documento, eliminadas)),
    resueltos,
    vacios,
    eliminadas,
    excedente,
  }
}

export { FILAS_POR_LAMINA }
