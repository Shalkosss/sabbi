import 'server-only'


import type { EstadoRevision } from '../estado'
import type { ProductoCatalogo } from './emparejar'
import { clienteServidor } from '../supabase/servidor'
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
  created_at: string
}

export interface PropuestaCargada {
  readonly propuestaId: string
  readonly mandato: string | null
  readonly estado: string
  readonly version: number
  readonly revision: EstadoRevision
}

export async function cargarPropuesta(propuestaId: string): Promise<PropuestaCargada | null> {
  const supabase = await clienteServidor()

  const { data } = await supabase
    .from('proposals')
    .select('id, ficha_id, mandato, estado, version, created_at')
    .eq('id', propuestaId)
    .maybeSingle<FilaPropuesta>()

  if (data === null || data === undefined || data.ficha_id === null) return null

  const revision = await cargarRevision(data.ficha_id)
  if (revision === null) return null

  return {
    propuestaId: data.id,
    mandato: data.mandato,
    estado: data.estado,
    version: data.version,
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
    .select('nombre, ret_min, ret_max, dist_min, dist_max, dist_frecuencia, moneda')

  return ((data ?? []) as FilaProducto[]).map((fila) => ({
    nombre: fila.nombre,
    retMin: aFraccion(fila.ret_min),
    retMax: aFraccion(fila.ret_max),
    distMin: aFraccion(fila.dist_min),
    distMax: aFraccion(fila.dist_max),
    distFrecuencia: fila.dist_frecuencia,
    moneda: fila.moneda,
  }))
}

/** Las asset class conocidas, para poder mostrar también las que van en cero. */
export async function catalogoDeAssetClass(): Promise<readonly string[]> {
  const supabase = await clienteServidor()

  const { data } = await supabase.from('asset_class_map').select('asset_class')

  const nombres = new Set((data ?? []).map((fila) => (fila as { asset_class: string }).asset_class))
  return [...nombres].sort((a, b) => a.localeCompare(b))
}
