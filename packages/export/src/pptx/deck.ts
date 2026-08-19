/**
 * El deck, de punta a punta: plantilla + propuesta -> archivo .pptx.
 *
 * La plantilla entra como bytes y no se lee del disco aca. El paquete queda
 * sin dependencias del sistema de archivos, que es lo que permite correrlo
 * igual en un test, en un script y en una funcion serverless donde el disco
 * es de solo lectura y la ruta no es la del repositorio.
 */
import type { Propuesta } from '@sabbi/core'

import { abrir, escribirLamina, guardar, leerLamina } from './documento.js'
import type { ContextoDeck } from './mapa.js'
import { tokensDePropuesta } from './mapa.js'
import { rellenarLamina } from './rellenar.js'

export interface ResultadoDeck {
  readonly archivo: Uint8Array
  /** Tokens que se resolvieron con un valor de la propuesta. */
  readonly resueltos: readonly string[]
  /** Tokens que quedaron en blanco por falta de dato. */
  readonly vacios: readonly string[]
}

export function armarDeck(
  plantilla: Uint8Array,
  propuesta: Propuesta,
  contexto: ContextoDeck,
): ResultadoDeck {
  const valores = tokensDePropuesta(propuesta, contexto)

  let documento = abrir(plantilla)
  const resueltos: string[] = []
  const vacios: string[] = []

  for (const n of documento.laminas) {
    const relleno = rellenarLamina(leerLamina(documento, n), valores)

    documento = escribirLamina(documento, n, relleno.xml)
    resueltos.push(...relleno.resueltos)
    vacios.push(...relleno.vacios)
  }

  return { archivo: guardar(documento), resueltos, vacios }
}
