import crudo from '../benchmarks.v3.json' with { type: 'json' }

import { benchmarksSchema, CLASES, PERFILES } from './schema.js'
import type { Benchmarks, ClaseModelo, Perfil } from './schema.js'

export { benchmarksSchema, CLASES, PERFILES }
export type { Benchmarks, ClaseModelo, Perfil }

/**
 * Configuracion validada.
 *
 * Se valida al cargar el modulo, no al usarla: un benchmark mal cuadrado tiene
 * que romper el arranque, no aparecer como una propuesta con cifras raras.
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
 * En la hoja de origen los pesos estan sobre el patrimonio total. La cascada de
 * ETFs trabaja sobre el dinero nuevo de la clase, asi que necesita la
 * proporcion interna. Sin este paso el reparto queda escalado de mas.
 */
export function pesosDeClase(clase: ClaseModelo, perfil: Perfil): Record<string, number> {
  const productos = benchmarks.clases[clase].productos
  const total = productos.reduce((acc, p) => acc + p.pesos[perfil], 0)
  if (total <= 0) return {}
  return Object.fromEntries(productos.map((p) => [p.nombre, p.pesos[perfil] / total]))
}

/** Nombres con los que la hoja Data identifica los dos bloques de privados. */
const PRODUCTO_CLUB = 'Club deals'
const PRODUCTO_OTROS = 'Otros'

export interface PesosPrivados {
  /** Peso de la clase entera sobre el patrimonio. */
  readonly clase: number
  /** Peso del bloque de club deals, tambien sobre el patrimonio. */
  readonly club: number
  /** Peso del bloque de otros alternativos, sobre el patrimonio. */
  readonly otros: number
}

/**
 * Pesos de Mercados Privados, en la forma que espera `repartirPrivados`.
 *
 * A diferencia de las otras clases, privados no se reparte por producto sino
 * por bloque: club y otros salen con su peso sobre el patrimonio, y el resto de
 * la clase cae en los fondos de la familia oportunidad. Por eso no se
 * renormaliza: los tres pesos conviven en la misma escala.
 */
export function pesosPrivadosDe(perfil: Perfil): PesosPrivados {
  const privados = benchmarks.clases.privados
  const peso = (nombre: string): number =>
    privados.productos.find((p) => p.nombre === nombre)?.pesos[perfil] ?? 0

  return {
    clase: privados.pesos[perfil],
    club: peso(PRODUCTO_CLUB),
    otros: peso(PRODUCTO_OTROS),
  }
}
