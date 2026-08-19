/**
 * Lectura de una composicion escrita a mano.
 *
 * La celda dice «Peru 75%, Emergentes ex-Peru 15%, Latam ex-Peru 10%», o lo
 * mismo separado por saltos de linea, o por veinte espacios seguidos, o con el
 * porcentaje entre parentesis. El separador nunca fue el mismo dos veces.
 *
 * Por eso no se parte por comas: se busca el numero. Cada porcentaje cierra un
 * termino, y lo que hay entre un porcentaje y el siguiente es el nombre del
 * que viene. Eso sobrevive a cualquier separador, incluido ninguno.
 */

import type { Componente } from './tipos.js'

/**
 * Nombre, luego numero, luego `%`. El nombre es perezoso para no comerse el
 * porcentaje anterior, y admite parentesis porque varios los llevan en el
 * nombre: «Bonos Corporativos Investment Grade (AAA-BBB) 8%».
 */
const TERMINO = /([^,;\n]+?)[\s:]*\(?(\d+(?:[.,]\d+)?)\s*%\)?/g

export interface Bruto {
  readonly nombre: string
  /** Fraccion, no puntos porcentuales. */
  readonly pct: number
}

export function leerComposicion(texto: string): readonly Bruto[] {
  const salida: Bruto[] = []
  for (const encontrado of texto.matchAll(TERMINO)) {
    const nombre = (encontrado[1] ?? '').trim()
    const numero = Number.parseFloat((encontrado[2] ?? '').replace(',', '.'))
    if (nombre === '' || !Number.isFinite(numero)) continue
    salida.push({ nombre, pct: numero / 100 })
  }
  return salida
}

/**
 * Junta las partes que caen en el mismo nombre canonico.
 *
 * «Efectivo 15% ... Otros 0.72%» son dos escrituras de Cash y Otros: entran
 * como dos y salen como una sola fila de 15.72%. Sin esto la clave primaria
 * (producto, clase) se rompe al insertar.
 */
export function consolidar(componentes: readonly Componente[]): readonly Componente[] {
  const acumulado = new Map<string, number>()
  for (const componente of componentes) {
    acumulado.set(componente.nombre, (acumulado.get(componente.nombre) ?? 0) + componente.pct)
  }
  return [...acumulado.entries()]
    .map(([nombre, pct]) => ({ nombre, pct }))
    .sort((a, b) => b.pct - a.pct || a.nombre.localeCompare(b.nombre))
}

/** Un centavo de punto porcentual. Debajo de eso, redondeo de la planilla. */
const TOLERANCIA = 0.015

export const sumaCien = (componentes: readonly Componente[]): boolean =>
  Math.abs(componentes.reduce((acc, c) => acc + c.pct, 0) - 1) <= TOLERANCIA
