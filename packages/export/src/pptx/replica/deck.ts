import { strFromU8, unzipSync } from 'fflate'

import type { Propuesta } from '@sabbi/core'

import { CABECERA, filasDelAnexo } from './anexo.js'
import { LAMINAS_LISTAS, MAPA, valoresDe } from './mapa.js'
import { renderizarReplica } from './plantilla.js'
import type { ResultadoReplica } from './plantilla.js'
import { ajustarMarco, altoDelMarco, altosDe, paginarFilas, rehacerTabla } from './tabla.js'

/**
 * El deck replica, con las laminas que hoy tienen de donde sacar su dato.
 *
 * Sale corto a proposito. La plantilla trae 22 laminas y el mapa dice, una por
 * una, que le falta a cada una; las que no estan resueltas no se imprimen a
 * medias. Cuando una consiga su fuente se cambia su estado en el mapa y aparece
 * aca sin tocar nada mas.
 *
 * El anexo es la excepcion a esa cuenta: en la plantilla son tres laminas —la
 * 20, la 21 y la 22— porque el cliente de referencia tenia esa cantidad de
 * instrumentos, pero son la misma lamina repetida. Se arma una sola tabla y la
 * lamina 20 sale tantas veces como paginas hagan falta; las otras dos no salen
 * nunca.
 *
 * La plantilla llega como argumento y no se lee del disco: el paquete tiene que
 * poder correr donde el sistema de archivos no es el del repositorio, que es
 * donde corre la aplicacion.
 */

/** La lamina de la plantilla que dibuja el anexo. Las 21 y 22 son sus paginas. */
const LAMINA_ANEXO = 20

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
  const pedidas = opciones.laminas ?? LAMINAS_LISTAS

  // El anexo no se pagina a ojo: se mide contra el alto que el diseno le
  // reservo a la tabla en la lamina, que es lo unico que decide si entra.
  const xmlAnexo = strFromU8(
    unzipSync(plantilla)[`ppt/slides/slide${LAMINA_ANEXO}.xml`] ?? new Uint8Array(),
  )
  const paginas = pedidas.includes(LAMINA_ANEXO)
    ? paginarFilas(filasDelAnexo(propuesta), altosDe(xmlAnexo), {
        altoEmu: altoDelMarco(xmlAnexo),
        fijas: [CABECERA],
      })
    : []

  const laminas = pedidas.flatMap((numero) =>
    numero === LAMINA_ANEXO ? paginas.map(() => numero) : [numero],
  )

  return renderizarReplica(plantilla, valoresDe(propuesta, opciones.fecha, laminas), {
    laminas,
    transformar: (numero, xml, ocurrencia) => {
      if (numero !== LAMINA_ANEXO) return xml
      const pagina = paginas[ocurrencia]
      if (pagina === undefined) return xml

      const { xml: conFilas, altoEmu } = rehacerTabla(xml, pagina)
      return ajustarMarco(conFilas, altoEmu)
    },
  })
}

/** Cuantas laminas hay en cada estado. La foto de la fase 6 en una linea. */
export function avanceReplica(): Readonly<Record<string, number>> {
  const cuenta: Record<string, number> = {}
  for (const lamina of MAPA) cuenta[lamina.estado] = (cuenta[lamina.estado] ?? 0) + 1
  return cuenta
}
