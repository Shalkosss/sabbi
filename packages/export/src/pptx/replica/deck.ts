import { strFromU8, unzipSync } from 'fflate'

import type { Propuesta } from '@sabbi/core'

import { CABECERA, filasDelAnexo, tarjetasDelPortafolio } from './anexo.js'
import { LAMINAS_TODAS, MAPA, valoresDe } from './mapa.js'
import { renderizarReplica } from './plantilla.js'
import type { ResultadoReplica } from './plantilla.js'
import { ajustarMarco, altoDelMarco, altosDe, paginarFilas, rehacerTabla } from './tabla.js'
import { escribirTarjetas, moldesDe, paginarTarjetas } from './tarjetas.js'

/**
 * El deck replica.
 *
 * Salen todas las laminas, y las que todavia no tienen de donde sacar su dato salen con
 * las celdas en blanco. Es lo que pidio la mesa y tiene sentido: un hueco dice
 * que falta algo y se puede llenar a mano antes de la reunion; una lamina que
 * no esta no dice nada. `sinFuente` devuelve exactamente que quedo vacio, y
 * `npm run revisar-deck` dice por que.
 *
 * El mapa manda sobre cada lamina. Cuando una consigue su fuente se cambia su
 * estado ahi y deja de salir en blanco, sin tocar nada mas.
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

/**
 * La lamina que dibuja el "antes y despues". Las 12 a la 16 son sus paginas.
 *
 * De la 16 se toma prestado un molde que la 11 no tiene: el guion que se
 * dibuja cuando una clase no tenia nada antes y nace del plan.
 */
const LAMINA_ANTES_DESPUES = 11
const LAMINA_CON_VACIO = 16

export interface OpcionesDeckReplica {
  /** La fecha de la portada. Llega de afuera: el motor no mira el reloj. */
  readonly fecha: Date
  /**
   * Que laminas sacar. Por defecto, todas menos las paginas del anexo.
   *
   * Sirve para pedir un deck corto — solo las que estan completas — o una sola
   * lamina para mirarla.
   */
  readonly laminas?: readonly number[]
}

export function armarDeckReplica(
  plantilla: Uint8Array,
  propuesta: Propuesta,
  opciones: OpcionesDeckReplica,
): ResultadoReplica {
  const pedidas = opciones.laminas ?? LAMINAS_TODAS

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

  // El "antes y despues" es lo mismo pero con tarjetas en vez de filas: una por
  // clase, apiladas hasta que no entran y siguen en la lamina siguiente.
  const partes = unzipSync(plantilla)
  const leer = (n: number) => strFromU8(partes[`ppt/slides/slide${n}.xml`] ?? new Uint8Array())
  const moldes = moldesDe(leer(LAMINA_ANTES_DESPUES), leer(LAMINA_CON_VACIO))

  const tarjetas = pedidas.includes(LAMINA_ANTES_DESPUES)
    ? paginarTarjetas(tarjetasDelPortafolio(propuesta))
    : []

  const repeticiones = (numero: number): number => {
    if (numero === LAMINA_ANEXO) return paginas.length
    if (numero === LAMINA_ANTES_DESPUES) return tarjetas.length
    return 1
  }

  const laminas = pedidas.flatMap((numero) =>
    Array.from({ length: Math.max(1, repeticiones(numero)) }, () => numero),
  )

  return renderizarReplica(plantilla, valoresDe(propuesta, opciones.fecha, laminas), {
    laminas,
    transformar: (numero, xml, ocurrencia) => {
      if (numero === LAMINA_ANEXO) {
        const pagina = paginas[ocurrencia]
        if (pagina === undefined) return xml
        const { xml: conFilas, altoEmu } = rehacerTabla(xml, pagina)
        return ajustarMarco(conFilas, altoEmu)
      }

      if (numero === LAMINA_ANTES_DESPUES) {
        const pagina = tarjetas[ocurrencia]
        if (pagina === undefined || moldes === null) return xml
        const de = tarjetas.length === 1 ? '' : ` (lámina ${ocurrencia + 1} de ${tarjetas.length})`

        return escribirTarjetas(xml, moldes, pagina, {
          texto: `Patrimonio total, antes y después${de}`,
          bajada: 'Producto por producto, qué se mantiene y qué se cambia.',
        })
      }

      return xml
    },
  })
}

/** Cuantas laminas hay en cada estado. La foto de la fase 6 en una linea. */
export function avanceReplica(): Readonly<Record<string, number>> {
  const cuenta: Record<string, number> = {}
  for (const lamina of MAPA) cuenta[lamina.estado] = (cuenta[lamina.estado] ?? 0) + 1
  return cuenta
}
