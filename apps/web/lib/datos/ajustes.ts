import 'server-only'

import type { AjusteClase, ClaseModelo, Restriccion } from '@sabbi/core'

import type { ProductoOfrecible } from '../catalogo'
import type { AjustesObjetivo } from '../estado'
import { asesorActual, clienteServidor } from '../supabase/servidor'

/**
 * Lo que el asesor le hace al portafolio objetivo.
 *
 * Dos tablas y dos ideas. `proposal_restrictions` guarda los activos que el
 * asesor agrega al objetivo — existían desde el esquema inicial y nadie las
 * escribía todavía —; `proposal_class_adjustments`, los montos que clava por
 * clase. Las dos cuelgan de la propuesta, no de la ficha: son decisiones sobre
 * esta propuesta en particular, y otra propuesta del mismo cliente arranca
 * limpia.
 */

interface FilaRestriccion {
  id: string
  nombre: string
  monto_usd: number
  clase: string
  producto_id: string | null
  orden: number | null
}

interface FilaAjuste {
  clase: string
  modo: string
  monto_usd: number
}

export async function cargarAjustesObjetivo(propuestaId: string): Promise<AjustesObjetivo> {
  if (propuestaId === '') return { agregados: [], ajustes: [] }

  const supabase = await clienteServidor()

  const [{ data: restricciones }, { data: ajustes }] = await Promise.all([
    supabase
      .from('proposal_restrictions')
      .select('id, nombre, monto_usd, clase, producto_id, orden')
      .eq('proposal_id', propuestaId)
      .order('orden', { ascending: true })
      .returns<FilaRestriccion[]>(),
    supabase
      .from('proposal_class_adjustments')
      .select('clase, modo, monto_usd')
      .eq('proposal_id', propuestaId)
      .returns<FilaAjuste[]>(),
  ])

  return {
    agregados: (restricciones ?? []).map(
      (fila): Restriccion => ({
        id: fila.id,
        nombre: fila.nombre,
        montoUsd: Number(fila.monto_usd),
        clase: fila.clase as ClaseModelo,
        productoId: fila.producto_id,
      }),
    ),
    ajustes: (ajustes ?? []).map(
      (fila): AjusteClase => ({
        clase: fila.clase as ClaseModelo,
        modo: fila.modo === 'excluir' ? 'excluir' : 'fijar',
        montoUsd: Number(fila.monto_usd),
      }),
    ),
  }
}

/**
 * Guarda —o borra— un activo agregado.
 *
 * El id lo genera la pantalla, así que el mismo camino sirve para crear y para
 * corregir: un `upsert` por clave primaria. Borrar viaja por acá y no por una
 * acción aparte para que pase por la misma cola de autoguardado, que garantiza
 * que no haya dos envíos de la misma fila en vuelo a la vez.
 */
export async function guardarActivoAgregado(
  propuestaId: string,
  activo: Restriccion,
  eliminado: boolean,
): Promise<{ readonly error?: string }> {
  if (propuestaId === '') {
    return { error: 'Esta ficha no tiene una propuesta abierta. Volvé a subirla.' }
  }

  const supabase = await clienteServidor()

  if (eliminado) {
    const { error } = await supabase.from('proposal_restrictions').delete().eq('id', activo.id)
    return error === null ? {} : { error: error.message }
  }

  const asesor = await asesorActual()

  const { error } = await supabase.from('proposal_restrictions').upsert({
    id: activo.id,
    proposal_id: propuestaId,
    nombre: activo.nombre,
    monto_usd: activo.montoUsd,
    clase: activo.clase,
    producto_id: activo.productoId,
    created_by: asesor?.id ?? null,
  })

  return error === null ? {} : { error: error.message }
}

/** Guarda —o saca— el ajuste de una clase. Uno por clase: la PK lo garantiza. */
export async function guardarAjusteDeClase(
  propuestaId: string,
  ajuste: AjusteClase,
  eliminado: boolean,
): Promise<{ readonly error?: string }> {
  if (propuestaId === '') {
    return { error: 'Esta ficha no tiene una propuesta abierta. Volvé a subirla.' }
  }

  const supabase = await clienteServidor()

  if (eliminado) {
    const { error } = await supabase
      .from('proposal_class_adjustments')
      .delete()
      .eq('proposal_id', propuestaId)
      .eq('clase', ajuste.clase)
    return error === null ? {} : { error: error.message }
  }

  const asesor = await asesorActual()

  const { error } = await supabase.from('proposal_class_adjustments').upsert({
    proposal_id: propuestaId,
    clase: ajuste.clase,
    modo: ajuste.modo,
    monto_usd: ajuste.modo === 'excluir' ? 0 : ajuste.montoUsd,
    created_by: asesor?.id ?? null,
    updated_at: new Date().toISOString(),
  })

  return error === null ? {} : { error: error.message }
}

/**
 * El menú ofrecible, para el desplegable de "agregar activo".
 *
 * Escribir el nombre exacto del catálogo no es un capricho de tipeo: la vista
 * de rentabilidad empareja las líneas del plan contra `products` por nombre, y
 * un activo agregado que no empareja sale sin retorno. Elegir de la lista lo
 * resuelve y de paso trae la clase ya puesta.
 */
export async function productosOfrecibles(): Promise<readonly ProductoOfrecible[]> {
  const supabase = await clienteServidor()

  const { data } = await supabase
    .from('products')
    .select('nombre, clase')
    .eq('ofrecer', true)
    .order('nombre', { ascending: true })
    .returns<{ nombre: string; clase: string | null }[]>()

  return (data ?? []).map((fila) => ({
    nombre: fila.nombre,
    clase: (fila.clase as ClaseModelo | null) ?? null,
  }))
}
