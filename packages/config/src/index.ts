import crudo from '../benchmarks.v4.json' with { type: 'json' }

import { benchmarksSchema, CLASES, PERFILES } from './schema.js'
import type { Benchmarks, ClaseModelo, Perfil } from './schema.js'

export { benchmarksSchema, CLASES, PERFILES }
export type { Benchmarks, ClaseModelo, Perfil }

/**
 * Configuracion validada.
 *
 * Se valida al cargar el modulo, no al usarla: un benchmark mal cuadrado tiene
 * que romper el arranque, no aparecer como una propuesta con cifras raras.
 *
 * Desde la v4, Club Deals y Otros son clases propias del benchmark, ya no
 * bloques internos de Mercados Privados. Los pesos son los mismos de la hoja
 * Data; lo que cambia es donde viven. La particion de Otros en BTC y Oro sale
 * de la hoja Allocation detallado.
 */
export const benchmarks: Benchmarks = benchmarksSchema.parse(crudo)

/**
 * Pesos por clase de un perfil, listos para el motor.
 *
 * Devuelve un objeto plano `clase -> peso` porque es lo que consume
 * `repartirPorClase`. El motor no conoce este paquete: recibe los pesos.
 */
export function benchmarkDe(perfil: Perfil): Record<ClaseModelo, number> {
  return Object.fromEntries(CLASES.map((c) => [c, benchmarks.clases[c].pesos[perfil]])) as Record<
    ClaseModelo,
    number
  >
}

/**
 * Pesos de los productos de una clase, renormalizados dentro de ella.
 *
 * En la hoja de origen los pesos estan sobre el patrimonio total. Los repartos
 * por producto trabajan sobre el dinero nuevo de la clase, asi que necesitan la
 * proporcion interna. Sin este paso el reparto queda escalado de mas.
 */
export function pesosDeClase(clase: ClaseModelo, perfil: Perfil): Record<string, number> {
  const productos = benchmarks.clases[clase].productos
  const total = productos.reduce((acc, p) => acc + p.pesos[perfil], 0)
  if (total <= 0) return {}
  return Object.fromEntries(productos.map((p) => [p.nombre, p.pesos[perfil] / total]))
}
