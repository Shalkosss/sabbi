import type { Propuesta } from '@sabbi/core'

import { LAMINAS_LISTAS, MAPA, valoresDe } from './mapa.js'
import { renderizarReplica } from './plantilla.js'
import type { ResultadoReplica } from './plantilla.js'

/**
 * El deck replica, con las laminas que hoy tienen de donde sacar su dato.
 *
 * Sale corto a proposito. La plantilla trae 22 laminas y el mapa dice, una por
 * una, que le falta a cada una; las que no estan resueltas no se imprimen a
 * medias. Cuando una consiga su fuente se cambia su estado en el mapa y aparece
 * acá sin tocar nada mas.
 *
 * La plantilla llega como argumento y no se lee del disco: el paquete tiene que
 * poder correr donde el sistema de archivos no es el del repositorio, que es
 * donde corre la aplicacion.
 */

export interface OpcionesDeckReplica {
  /** La fecha de la portada. Llega de afuera: el motor no mira el reloj. */
  readonly fecha: Date
  /**
   * Laminas a forzar, por si alguien quiere ver una que el mapa todavia no da
   * por lista. Sus tokens sin fuente salen en blanco y en `sinFuente`.
   */
  readonly laminas?: readonly number[]
}

export function armarDeckReplica(
  plantilla: Uint8Array,
  propuesta: Propuesta,
  opciones: OpcionesDeckReplica,
): ResultadoReplica {
  const laminas = opciones.laminas ?? LAMINAS_LISTAS

  return renderizarReplica(plantilla, valoresDe(propuesta, opciones.fecha, laminas), { laminas })
}

/** Cuantas laminas hay en cada estado. La foto de la fase 6 en una linea. */
export function avanceReplica(): Readonly<Record<string, number>> {
  const cuenta: Record<string, number> = {}
  for (const lamina of MAPA) cuenta[lamina.estado] = (cuenta[lamina.estado] ?? 0) + 1
  return cuenta
}
