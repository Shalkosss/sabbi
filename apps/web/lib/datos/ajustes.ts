import 'server-only'

import type { AjusteClase, ClaseModelo } from '@sabbi/core'

import type { ActivoAgregado, ProductoOfrecible } from '../catalogo'
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
  /** El producto enlazado, del que salen la rentabilidad y la distribucion. */
  products: {
    ret_min: number | null
    ret_max: number | null
    dist_min: number | null
    dist_max: number | null
    dist_frecuencia: string | null
  } | null
}

/**
 * Del porcentaje del catalogo a la fraccion del motor.
 *
 * La tabla guarda 4.5 y todo lo que calcula espera 0.045. Es la misma
 * conversion que hace la carga de productos de la propuesta; duplicarla aca
 * seria barato hasta el dia que una de las dos cambie.
 */
const aFraccion = (valor: number | null): number | null =>
  valor === null ? null : Number(valor) / 100

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
      .select(
        'id, nombre, monto_usd, clase, producto_id, orden, ' +
          'products:producto_id (ret_min, ret_max, dist_min, dist_max, dist_frecuencia)',
      )
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
      (fila): ActivoAgregado => ({
        id: fila.id,
        nombre: fila.nombre,
        montoUsd: Number(fila.monto_usd),
        clase: fila.clase as ClaseModelo,
        productoId: fila.producto_id,
        // La rentabilidad y la distribucion viven en el catalogo, no en la
        // restriccion: son del producto y valen para cualquier propuesta que
        // lo use. Aca se leen del producto enlazado.
        retMin: aFraccion(fila.products?.ret_min ?? null),
        retMax: aFraccion(fila.products?.ret_max ?? null),
        distMin: aFraccion(fila.products?.dist_min ?? null),
        distMax: aFraccion(fila.products?.dist_max ?? null),
        distFrecuencia: fila.products?.dist_frecuencia ?? null,
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

/** Identificador estable a partir del nombre, como el alta del catálogo. */
const identificador = (nombre: string): string =>
  nombre
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 60)

/** De la fracción del motor al porcentaje que guarda el catálogo. */
const aPorcentaje = (valor: number | null): number | null =>
  valor === null ? null : Number((valor * 100).toFixed(6))

/**
 * Da de alta en el catálogo el activo que el asesor agregó al objetivo.
 *
 * Un activo agregado que no existe en `products` sale mudo: la sección 6 de la
 * propuesta empareja las líneas contra el catálogo y una fila sin producto
 * imprime dos celdas vacías donde van la rentabilidad y la distribución. Antes
 * eso obligaba a pedirle a un admin que cargara el producto y volver a la
 * ficha; ahora el alta viaja con el activo.
 *
 * Entra como `origen = 'ficha'` y sin `ofrecer`: no se cuela en el menú
 * neteable de su clase, que es la lista con la que el motor decide qué se
 * conserva —confundir las dos produjo el bug v37.25— y queda en la cola de
 * productos incompletos para que alguien lo termine.
 *
 * Devuelve el id del producto, o `null` cuando no hay nada que dar de alta.
 */
async function altaEnCatalogo(
  supabase: Awaited<ReturnType<typeof clienteServidor>>,
  activo: ActivoAgregado,
): Promise<string | null> {
  const nombre = activo.nombre.trim()
  if (nombre === '') return null

  // Ya enlazado a un producto del catálogo: se completa, no se duplica.
  const id = activo.productoId ?? identificador(nombre)
  if (id === '') return null

  const { error } = await supabase.from('products').upsert(
    {
      id,
      nombre,
      clase: activo.clase,
      ret_min: aPorcentaje(activo.retMin),
      ret_max: aPorcentaje(activo.retMax),
      dist_min: aPorcentaje(activo.distMin),
      dist_max: aPorcentaje(activo.distMax),
      dist_frecuencia: activo.distFrecuencia,
      origen: 'ficha',
      ofrecer: false,
    },
    { onConflict: 'id' },
  )

  // El alta es un extra: si falla, el activo igual tiene que poder guardarse en
  // la propuesta. Perder la rentabilidad es malo; perder el activo, peor.
  return error === null ? id : null
}

/**
 * Guarda —o borra— un activo agregado.
 *
 * El id lo genera la pantalla, así que el mismo camino sirve para crear y para
 * corregir: un `upsert` por clave primaria. Borrar viaja por acá y no por una
 * acción aparte para que pase por la misma cola de autoguardado, que garantiza
 * que no haya dos envíos de la misma fila en vuelo a la vez.
 *
 * De paso da de alta el producto en el catálogo: un activo que alguien cargó
 * con su rentabilidad una vez no se vuelve a cargar en la propuesta siguiente.
 */
export async function guardarActivoAgregado(
  propuestaId: string,
  activo: ActivoAgregado,
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
  const productoId = await altaEnCatalogo(supabase, activo)

  const { error } = await supabase.from('proposal_restrictions').upsert({
    id: activo.id,
    proposal_id: propuestaId,
    nombre: activo.nombre,
    monto_usd: activo.montoUsd,
    clase: activo.clase,
    producto_id: productoId ?? activo.productoId,
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
    .select('id, nombre, clase')
    .eq('ofrecer', true)
    .order('nombre', { ascending: true })
    .returns<{ id: string; nombre: string; clase: string | null }[]>()

  return (data ?? []).map((fila) => ({
    id: fila.id,
    nombre: fila.nombre,
    clase: (fila.clase as ClaseModelo | null) ?? null,
  }))
}
