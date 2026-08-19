import 'server-only'

import type { SupabaseClient } from '@supabase/supabase-js'
import type { PosicionFicha } from '@sabbi/io'

import { normalizarNombre } from './emparejar'

/**
 * Alta automática de productos desde la ficha.
 *
 * La base de productos deja de ser una planilla que alguien alimenta a mano:
 * cada ficha que se sube la alimenta sola. Lo que la ficha trae y el catálogo
 * no conoce se da de alta al instante, con lo poco que la ficha sabe — nombre,
 * clase, moneda y el rendimiento que estimó el cliente — y queda marcado con
 * `origen = 'ficha'` en la cola de productos por completar.
 *
 * El emparejamiento es deliberadamente cobarde, igual que el de la propuesta:
 * exacto, luego normalizado, luego subcadena solo si hay un único candidato.
 * Crear un duplicado por no reconocer un alias es barato de arreglar; colgarle
 * a un cliente el producto de otro no.
 *
 * Solo lo financiero se cataloga: un inmueble es del cliente, no un producto.
 */

interface ProductoExistente {
  readonly id: string
  readonly nombre: string
}

/** El único candidato que contiene o está contenido en el nombre buscado. */
function porSubcadena(
  buscado: string,
  porNombre: ReadonlyMap<string, string>,
): string | null {
  const candidatos = [...porNombre.entries()]
    .filter(([nombre]) => nombre.includes(buscado) || buscado.includes(nombre))
    .map(([, id]) => id)

  return candidatos.length === 1 ? (candidatos[0] ?? null) : null
}

/**
 * De la fracción de la ficha a los puntos porcentuales de `products`.
 *
 * Las dos unidades conviven en el sistema y confundirlas escribe un 0.045 en
 * una columna donde 4.5 quiere decir 4.5%: el producto queda con un retorno
 * cien veces menor y nadie lo nota hasta que sale impreso.
 */
const aPuntos = (fraccion: number | null): number | null =>
  fraccion === null ? null : fraccion * 100

/** Un id legible y único para un producto nuevo. */
function idDe(nombre: string, tomados: ReadonlySet<string>): string {
  const base = normalizarNombre(nombre).replace(/ /g, '-').slice(0, 40) || 'producto'
  if (!tomados.has(base)) return base
  let n = 2
  while (tomados.has(`${base}-${n}`)) n += 1
  return `${base}-${n}`
}

export interface ResultadoAlta {
  /** productoId por posición, indexado por `orden`. */
  readonly productoPorOrden: ReadonlyMap<number, string>
  /** Nombres dados de alta en esta pasada, para el aviso de la pantalla. */
  readonly creados: readonly string[]
  readonly error?: string
}

const SIN_ALTA: ResultadoAlta = { productoPorOrden: new Map(), creados: [] }

/**
 * Empareja las posiciones financieras contra el catálogo y da de alta las que
 * no existen. Devuelve el mapa posición → producto para persistirlo junto a la
 * ficha, y la lista de altas para avisarle al asesor.
 *
 * Cualquier error deja la subida seguir sin enlaces: perder la ficha entera
 * por no poder catalogar un producto sería castigar al asesor por un problema
 * de la mesa.
 */
export async function altaProductosDeFicha(
  supabase: SupabaseClient,
  posiciones: readonly PosicionFicha[],
  asesorId: string,
): Promise<ResultadoAlta> {
  const financieras = posiciones.filter(
    (posicion) => posicion.origen === 'financiero' && posicion.institucionProducto.trim() !== '',
  )
  if (financieras.length === 0) return SIN_ALTA

  const { data, error } = await supabase.from('products').select('id, nombre')
  if (error !== null || data === null) {
    return { ...SIN_ALTA, error: `No pude leer el catálogo: ${error?.message ?? 'sin detalle'}` }
  }

  const existentes = data as ProductoExistente[]
  const ids = new Set(existentes.map((p) => p.id))
  const porNombre = new Map(existentes.map((p) => [normalizarNombre(p.nombre), p.id]))

  const productoPorOrden = new Map<number, string>()
  const nuevos: Record<string, unknown>[] = []
  const creados: string[] = []
  const ordenesNuevos: number[] = []

  for (const posicion of financieras) {
    const buscado = normalizarNombre(posicion.institucionProducto)
    const existente = porNombre.get(buscado) ?? porSubcadena(buscado, porNombre)

    if (existente !== null && existente !== undefined) {
      productoPorOrden.set(posicion.orden, existente)
      continue
    }

    const id = idDe(posicion.institucionProducto, ids)
    ids.add(id)
    // Dos posiciones con el mismo nombre en la misma ficha son un solo producto.
    porNombre.set(buscado, id)
    productoPorOrden.set(posicion.orden, id)
    ordenesNuevos.push(posicion.orden)
    creados.push(posicion.institucionProducto)

    nuevos.push({
      id,
      nombre: posicion.institucionProducto,
      clase: posicion.claseModelo,
      moneda: posicion.moneda,
      // El rendimiento que estimó el cliente es el único dato de retorno que
      // hay; queda como punto de partida y la mesa lo corrige al completar.
      // La columna va en puntos porcentuales — un 4.5 quiere decir 4.5% — y la
      // ficha trae fracciones, así que se convierte al escribir.
      ret_min: aPuntos(posicion.rendimientoEst),
      ret_max: aPuntos(posicion.rendimientoEst),
      ofrecer: false,
      reconocible: true,
      origen: 'ficha',
      creado_por: asesorId,
      nota: `Alta automática desde ficha (${posicion.tipoFicha ?? 'sin tipo'}).`,
    })
  }

  if (nuevos.length > 0) {
    const { error: errorAlta } = await supabase.from('products').insert(nuevos)
    if (errorAlta !== null) {
      // La ficha sigue; solo se pierden los enlaces a los productos nuevos.
      for (const orden of ordenesNuevos) productoPorOrden.delete(orden)
      return {
        productoPorOrden,
        creados: [],
        error: `No pude dar de alta ${nuevos.length} productos nuevos: ${errorAlta.message}`,
      }
    }
  }

  return { productoPorOrden, creados }
}
