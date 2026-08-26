import 'server-only'


import type { AnotacionLinea } from '@sabbi/core'

import type { EstadoRevision } from '../estado'
import type { ProductoCatalogo } from './emparejar'
import { asesorActual, clienteServidor } from '../supabase/servidor'
import { cargarRevision } from './fichas'

/**
 * Lectura de una propuesta.
 *
 * Una propuesta no guarda cifras propias: guarda los parámetros con los que se
 * calcula y apunta a la ficha revisada. Las siete secciones se derivan en cada
 * lectura del mismo motor que corrió el asesor, así que no hay forma de que la
 * vista muestre un número que el cálculo ya no produciría.
 */

interface FilaPropuesta {
  id: string
  ficha_id: string | null
  mandato: string | null
  estado: string
  version: number
  reemplaza_a: string | null
  macro_version: number | null
  published_at: string | null
  snapshot: unknown
  created_at: string
  advisors: { nombre: string } | null
}

export interface PropuestaCargada {
  readonly propuestaId: string
  readonly fichaId: string
  readonly mandato: string | null
  readonly estado: string
  readonly publicada: boolean
  readonly version: number
  /** La version que esta reemplaza, si nacio de otra. */
  readonly reemplazaA: string | null
  readonly publicadaEn: string | null
  readonly publicadaPor: string | null
  readonly macroVersion: number | null
  /**
   * Lo que se congelo al publicar, sin validar todavia.
   *
   * Llega crudo porque viene de un `jsonb` y de una version de la aplicacion
   * que puede no ser esta. Quien lo use lo pasa por `leerSnapshot`.
   */
  readonly snapshot: unknown
  readonly revision: EstadoRevision
}

const COLUMNAS_PROPUESTA =
  'id, ficha_id, mandato, estado, version, reemplaza_a, macro_version, ' +
  'published_at, snapshot, created_at, advisors:published_by (nombre)'

export async function cargarPropuesta(propuestaId: string): Promise<PropuestaCargada | null> {
  const supabase = await clienteServidor()

  const { data } = await supabase
    .from('proposals')
    .select(COLUMNAS_PROPUESTA)
    .eq('id', propuestaId)
    .maybeSingle<FilaPropuesta>()

  if (data === null || data === undefined || data.ficha_id === null) return null

  const revision = await cargarRevision(data.ficha_id)
  if (revision === null) return null

  return {
    propuestaId: data.id,
    fichaId: data.ficha_id,
    mandato: data.mandato,
    estado: data.estado,
    publicada: data.estado === 'publicada',
    version: data.version,
    reemplazaA: data.reemplaza_a,
    publicadaEn: data.published_at,
    publicadaPor: data.advisors?.nombre ?? null,
    macroVersion: data.macro_version,
    snapshot: data.snapshot,
    revision,
  }
}

interface FilaProducto {
  nombre: string
  ret_min: number | null
  ret_max: number | null
  dist_min: number | null
  dist_max: number | null
  dist_frecuencia: string | null
  moneda: string | null
  liquidez: string | null
}

/**
 * El catálogo de productos, tal como está en la base.
 *
 * Los retornos vienen en puntos porcentuales — un 4.5 quiere decir 4.5% — y
 * acá se pasan a fracción, que es la unidad en la que trabaja todo lo demás.
 * Convertir en el borde y no al pintar evita que la misma cifra signifique dos
 * cosas según quién la lea.
 */
const aFraccion = (pct: number | null): number | null => (pct === null ? null : pct / 100)

export async function catalogoDeProductos(): Promise<readonly ProductoCatalogo[]> {
  const supabase = await clienteServidor()

  const { data } = await supabase
    .from('products')
    .select('nombre, ret_min, ret_max, dist_min, dist_max, dist_frecuencia, moneda, liquidez')

  return ((data ?? []) as FilaProducto[]).map((fila) => ({
    nombre: fila.nombre,
    retMin: aFraccion(fila.ret_min),
    retMax: aFraccion(fila.ret_max),
    distMin: aFraccion(fila.dist_min),
    distMax: aFraccion(fila.dist_max),
    distFrecuencia: fila.dist_frecuencia,
    moneda: fila.moneda,
    liquidez: fila.liquidez,
  }))
}

/**
 * Lo que el asesor escribió de cada línea del objetivo.
 *
 * Se guarda por nombre de instrumento porque es así como el motor las nombra e
 * imprime: una línea del objetivo puede no ser un producto del catálogo — el
 * inmobiliario TBD, el cash — y no tiene identificador propio.
 */
export async function anotacionesDeLinea(
  propuestaId: string,
): Promise<ReadonlyMap<string, AnotacionLinea>> {
  if (propuestaId === '') return new Map()

  const supabase = await clienteServidor()
  const { data } = await supabase
    .from('proposal_line_notes')
    .select('instrumento, descripcion, proposito')
    .eq('proposal_id', propuestaId)
    .returns<{ instrumento: string; descripcion: string; proposito: string }[]>()

  return new Map(
    (data ?? []).map((fila) => [
      fila.instrumento,
      { descripcion: fila.descripcion, proposito: fila.proposito },
    ]),
  )
}

/** Guarda —o borra, cuando queda vacía— la anotación de una línea. */
export async function guardarAnotacion(
  propuestaId: string,
  instrumento: string,
  anotacion: AnotacionLinea,
): Promise<{ readonly error?: string }> {
  if (propuestaId === '') {
    return { error: 'Esta propuesta no está abierta.' }
  }

  const supabase = await clienteServidor()

  // Dos campos vacíos no son una anotación: la fila se va en vez de quedar
  // ocupando la tabla con nada adentro.
  if (anotacion.descripcion.trim() === '' && anotacion.proposito.trim() === '') {
    const { error } = await supabase
      .from('proposal_line_notes')
      .delete()
      .eq('proposal_id', propuestaId)
      .eq('instrumento', instrumento)
    return error === null ? {} : { error: error.message }
  }

  const asesor = await asesorActual()

  const { error } = await supabase.from('proposal_line_notes').upsert({
    proposal_id: propuestaId,
    instrumento,
    descripcion: anotacion.descripcion,
    proposito: anotacion.proposito,
    created_by: asesor?.id ?? null,
    updated_at: new Date().toISOString(),
  })

  return error === null ? {} : { error: error.message }
}

/** Las asset class conocidas, para poder mostrar también las que van en cero. */
export async function catalogoDeAssetClass(): Promise<readonly string[]> {
  const supabase = await clienteServidor()

  const { data } = await supabase.from('asset_class_map').select('asset_class')

  const nombres = new Set((data ?? []).map((fila) => (fila).asset_class))
  return [...nombres].sort((a, b) => a.localeCompare(b))
}
