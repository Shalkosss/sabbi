'use server'

import { revalidatePath } from 'next/cache'

import { clienteServidor } from '../../lib/supabase/servidor'

/**
 * Alta y edición de un producto del catálogo.
 *
 * La composición se reescribe entera en cada guardado: sacar una región del
 * formulario tiene que sacarla también de la base, y actualizar parte por parte
 * deja huérfanas las que el asesor quitó.
 *
 * No hay validación de negocio acá que no esté también en el esquema. Las
 * claves foráneas contra las listas son lo que garantiza que nadie invente una
 * clase de activo, y el `check` de porcentaje es lo que impide un 150%. Una
 * validación que solo vive en el formulario es una validación que se saltea
 * cualquier otro camino de escritura.
 */

export interface ParteEntrada {
  readonly nombre: string
  readonly pct: number
}

export interface ProductoEntrada {
  /** Vacío para un producto nuevo. */
  readonly id: string
  readonly nombre: string
  readonly moneda: string | null
  readonly liquidez: string | null
  readonly comisionPct: number | null
  readonly retMin: number | null
  readonly retMax: number | null
  readonly gestor: string | null
  readonly administrador: string | null
  readonly esProductoSabbi: boolean
  readonly subidoACircle: boolean
  readonly ofrecer: boolean
  readonly focoGeografico: readonly ParteEntrada[]
  readonly claseActivo: readonly ParteEntrada[]
  readonly subyacentes: readonly ParteEntrada[]
}

export type ResultadoGuardado =
  | { readonly ok: true; readonly id: string }
  | { readonly ok: false; readonly error: string }

/** La clase del motor sale de la parte más grande de la composición. */
const CLASE_MOTOR: Readonly<Record<string, string>> = {
  'Mercados Públicos - Fijo': 'fijo',
  'Mercados Públicos - Variable': 'variable',
  'Mercados Privados': 'privados',
  'Club deals': 'privados',
  'Inmobiliario Directo': 'inm',
  'Cash y Otros': 'cash',
}

const identificador = (nombre: string): string =>
  nombre
    .normalize('NFD')
    .replace(/[\p{Mn}]/gu, '')
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 40)

export async function guardarProducto(entrada: ProductoEntrada): Promise<ResultadoGuardado> {
  const nombre = entrada.nombre.trim()
  if (nombre === '') return { ok: false, error: 'El producto necesita un nombre.' }

  const supabase = await clienteServidor()
  const esNuevo = entrada.id === ''
  const id = esNuevo ? identificador(nombre) : entrada.id
  if (id === '') return { ok: false, error: 'Ese nombre no produce un identificador válido.' }

  // Dar de alta no puede pisar un producto que ya existe. El identificador sale
  // del nombre y se corta a cuarenta caracteres, así que dos nombres distintos
  // chocan con facilidad — y el alta automática desde la ficha usa la misma
  // receta. Con `upsert` el producto viejo perdía su clase, su retorno y su
  // composición sin que nadie se enterara; con `insert` la base lo rechaza y el
  // asesor ve por qué.
  if (esNuevo) {
    const { data: existente } = await supabase
      .from('products')
      .select('nombre')
      .eq('id', id)
      .maybeSingle<{ nombre: string }>()

    if (existente !== null && existente !== undefined) {
      return {
        ok: false,
        error: `«${existente.nombre}» ya usa ese identificador. Cambiá el nombre para distinguirlos.`,
      }
    }
  }

  const dominante = [...entrada.claseActivo].sort((a, b) => b.pct - a.pct)[0]?.nombre
  const clase = dominante === undefined ? null : (CLASE_MOTOR[dominante] ?? null)

  const { error } = await supabase.from('products').upsert(
    {
      id,
      nombre,
      clase,
      moneda: entrada.moneda,
      liquidez: entrada.liquidez,
      comision_pct: entrada.comisionPct,
      ret_min: entrada.retMin,
      ret_max: entrada.retMax,
      gestor: entrada.gestor,
      administrador: entrada.administrador,
      gestor_nombre: entrada.gestor,
      administrador_nombre: entrada.administrador,
      es_producto_sabbi: entrada.esProductoSabbi,
      subido_a_circle: entrada.subidoACircle,
      ofrecer: entrada.ofrecer,
      actualizado_en: new Date().toISOString(),
    },
    { onConflict: 'id' },
  )

  if (error !== null) return { ok: false, error: mensaje(error.message) }

  const bloques = [
    ['producto_foco_geografico', 'region', entrada.focoGeografico],
    ['producto_clase_activo', 'clase_activo', entrada.claseActivo],
    ['producto_subyacente', 'subyacente', entrada.subyacentes],
  ] as const

  for (const [tabla, columna, partes] of bloques) {
    const { error: borrado } = await supabase.from(tabla).delete().eq('producto_id', id)
    if (borrado !== null) return { ok: false, error: mensaje(borrado.message) }

    const filas = partes
      .filter((parte) => parte.nombre !== '' && parte.pct > 0)
      .map((parte) => ({ producto_id: id, [columna]: parte.nombre, pct: parte.pct }))

    if (filas.length === 0) continue

    const { error: insercion } = await supabase.from(tabla).insert(filas)
    if (insercion !== null) return { ok: false, error: mensaje(insercion.message) }
  }

  revalidatePath('/catalogo')
  return { ok: true, id }
}

/**
 * El mensaje de Postgres, traducido a lo que el asesor puede hacer al respecto.
 *
 * «violates foreign key constraint» significa que eligió algo que no está en la
 * lista, y eso solo pasa si la lista quedó vieja en pantalla.
 */
function mensaje(crudo: string): string {
  if (crudo.includes('foreign key')) {
    return 'Alguno de los valores elegidos ya no está en la lista. Recargá la página y volvé a intentar.'
  }
  if (crudo.includes('duplicate key')) {
    return 'Ya existe un producto con ese nombre.'
  }
  if (crudo.includes('violates check constraint') && crudo.includes('pct')) {
    return 'Cada parte de la composición tiene que estar entre 0% y 100%.'
  }
  if (crudo.includes('row-level security')) {
    return 'Tu cuenta no está dada de alta como asesor de Sabbi, así que no puede escribir en el catálogo.'
  }
  return crudo
}
