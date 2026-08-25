import 'server-only'

import { leerSnapshot } from '@sabbi/core'
import type { Bloqueo, Propuesta } from '@sabbi/core'

import { construirPropuesta } from './armar-propuesta'
import {
  anotacionesDeLinea,
  cargarPropuesta,
  catalogoDeAssetClass,
  catalogoDeProductos,
} from './datos/propuestas'
import type { PropuestaCargada } from './datos/propuestas'
import { macroActiva } from './datos/macro'

/**
 * De dónde salen las cifras de una propuesta.
 *
 * Hay dos respuestas y esta función es el único lugar que las elige, porque la
 * pantalla, el Excel y los dos decks tienen que estar mirando la misma. Un
 * **borrador** se recalcula en cada lectura: se corrige la ficha y la cifra se
 * mueve, se guarda una macro nueva y se mueven todas, y eso es lo que la mesa
 * quiere mientras la propuesta se trabaja. Una **publicada** se lee de su
 * snapshot y no se recalcula nunca: es la que el cliente ya tiene.
 *
 * El tercer caso es el que hay que decir en voz alta. Si una propuesta está
 * publicada y su snapshot no se puede leer —viene de un formato viejo, quedó
 * incompleto— se recalcula, pero se avisa: lo que se está mostrando no es lo
 * que se publicó, y quien lo lea tiene que saberlo antes de mandárselo a
 * alguien.
 */

export interface Congelada {
  /** Versión de la macro con la que se calculó. `null` si fue la de fábrica. */
  readonly macroVersion: number | null
  readonly macroDeFabrica: boolean
  readonly motor: string
  readonly congeladaEn: string
}

export interface Vigente {
  readonly propuesta: Propuesta
  readonly cargada: PropuestaCargada
  /** Los datos del congelado, o `null` cuando lo que se muestra es un cálculo de ahora. */
  readonly congelada: Congelada | null
  /** Por qué una publicada terminó recalculándose. `null` en el caso normal. */
  readonly snapshotIlegible: string | null
  /** La versión de macro que corresponde escribir al pie de un archivo. */
  readonly versionMacro: number | null
}

export type ResultadoVigente =
  | ({ readonly ok: true } & Vigente)
  | {
      readonly ok: false
      readonly bloqueos: readonly Bloqueo[]
      /**
       * La propuesta igual viaja: sin cifras que mostrar, la pantalla todavía
       * necesita saber de quién es y a qué ficha volver.
       */
      readonly cargada: PropuestaCargada
    }

export async function propuestaVigente(propuestaId: string): Promise<ResultadoVigente | null> {
  const cargada = await cargarPropuesta(propuestaId)
  if (cargada === null) return null

  if (cargada.publicada) {
    const lectura = leerSnapshot(cargada.snapshot)

    if (lectura.ok) {
      return {
        ok: true,
        propuesta: lectura.snapshot.propuesta,
        cargada,
        congelada: {
          macroVersion: lectura.snapshot.macro.version,
          macroDeFabrica: lectura.snapshot.macro.esDeFabrica,
          motor: lectura.snapshot.motor,
          congeladaEn: lectura.snapshot.congeladaEn,
        },
        snapshotIlegible: null,
        versionMacro: lectura.snapshot.macro.version,
      }
    }

    const recalculada = await recalcular(cargada)
    if (!recalculada.ok) return recalculada

    return {
      ...recalculada,
      snapshotIlegible:
        `Esta propuesta está publicada pero su snapshot ${lectura.motivo}. Lo que ves es un ` +
        'cálculo de ahora, con el catálogo y la macro de hoy: no necesariamente es lo que se ' +
        'publicó. Generá una versión nueva antes de mandar nada.',
    }
  }

  return recalcular(cargada)
}

/** El camino normal del borrador: el motor, con la macro activa. */
async function recalcular(cargada: PropuestaCargada): Promise<ResultadoVigente> {
  const [catalogo, assetClassCatalogo, anotaciones, activa] = await Promise.all([
    catalogoDeProductos(),
    catalogoDeAssetClass(),
    anotacionesDeLinea(cargada.propuestaId),
    macroActiva(),
  ])

  const resultado = construirPropuesta(cargada.revision, {
    mandato: cargada.mandato,
    catalogo,
    assetClassCatalogo,
    anotaciones,
    macro: activa.macro,
  })

  if (!resultado.ok) return { ok: false, bloqueos: resultado.bloqueos, cargada }

  return {
    ok: true,
    propuesta: resultado.propuesta,
    cargada,
    congelada: null,
    snapshotIlegible: null,
    versionMacro: activa.esDeFabrica ? null : activa.macro.version,
  }
}
