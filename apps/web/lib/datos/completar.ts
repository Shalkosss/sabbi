import 'server-only'

import type { PosicionEditada } from '../estado'
import { clienteServidor } from '../supabase/servidor'
import { rendimientoDelCatalogo } from './alta-productos'
import { normalizarNombre } from './emparejar'

/**
 * Lo que el catálogo ya sabe, aplicado a las posiciones que llegaron sin eso.
 *
 * Al subir la ficha esto ya se hace una vez y se guarda. Pero el catálogo se
 * sigue llenando después: un producto que la mesa carga el martes tiene que
 * completar la ficha que se subió el lunes, y hasta ahora no lo hacía. La
 * propuesta quedaba bloqueada por un rendimiento que estaba escrito en la
 * pantalla de al lado.
 *
 * No se persiste: se deriva en cada lectura. Un valor guardado es una foto que
 * envejece cuando la mesa corrige la banda del producto; este sigue al
 * catálogo. Lo que el asesor escriba a mano manda sobre esto, porque solo se
 * completa lo que está vacío.
 */

export interface Completadas {
  readonly posiciones: readonly PosicionEditada[]
  /** Las que tomaron su rendimiento del catálogo en esta lectura. */
  readonly delCatalogo: readonly string[]
}

interface FilaProducto {
  nombre: string
  ret_min: number | null
  ret_max: number | null
}

/** Dos productos con el mismo nombre y distinto retorno: no se elige, se deja vacío. */
const AMBIGUO = Symbol('ambiguo')

export async function completarDesdeCatalogo(
  posiciones: readonly PosicionEditada[],
): Promise<Completadas> {
  const pendientes = posiciones.filter(
    (posicion) =>
      posicion.origen === 'financiero' &&
      posicion.rendimientoEst === null &&
      posicion.institucionProducto.trim() !== '',
  )
  if (pendientes.length === 0) return { posiciones, delCatalogo: [] }

  const supabase = await clienteServidor()
  const { data } = await supabase
    .from('products')
    .select('nombre, ret_min, ret_max')
    .returns<FilaProducto[]>()

  const porNombre = new Map<string, number | typeof AMBIGUO | null>()
  for (const fila of data ?? []) {
    const clave = normalizarNombre(fila.nombre)
    const rendimiento = rendimientoDelCatalogo(fila)
    if (!porNombre.has(clave)) {
      porNombre.set(clave, rendimiento)
      continue
    }
    // Ante dos productos que se llaman igual y rinden distinto, el emparejador
    // se abstiene: adjudicarle a uno el retorno del otro sale impreso en un
    // documento que el cliente firma.
    if (porNombre.get(clave) !== rendimiento) porNombre.set(clave, AMBIGUO)
  }

  const delCatalogo: string[] = []

  const completadas = posiciones.map((posicion) => {
    if (!pendientes.includes(posicion)) return posicion

    const encontrado = porNombre.get(normalizarNombre(posicion.institucionProducto))
    if (encontrado === undefined || encontrado === null || encontrado === AMBIGUO) return posicion

    delCatalogo.push(posicion.institucionProducto)
    return { ...posicion, rendimientoEst: encontrado }
  })

  return { posiciones: completadas, delCatalogo }
}
