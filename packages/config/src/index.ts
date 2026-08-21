import crudo from '../benchmarks.v4.json' with { type: 'json' }

import { macroDeFabrica, macroSchema, reglasDeMacro, reglasSchema, validarMacro } from './macro.js'
import type { Macro, Validacion } from './macro.js'
import { benchmarksSchema, CLASES, PERFILES } from './schema.js'
import type { Benchmarks, ClaseModelo, Perfil } from './schema.js'

export { benchmarksSchema, CLASES, PERFILES }
export type { Benchmarks, ClaseModelo, Perfil }
export { macroDeFabrica, macroSchema, reglasDeMacro, reglasSchema, validarMacro }
export type { Macro, Validacion }

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
 * La macro de fabrica, ya armada.
 *
 * Es lo que corre cuando la base no tiene ninguna macro guardada — el primer
 * dia, o si la guardada no valida. Reproduce el caso Ana Tumi al centavo.
 */
export const MACRO_DE_FABRICA: Macro = macroDeFabrica(benchmarks)

/**
 * Pesos por clase de un perfil, listos para el motor.
 *
 * Devuelve un objeto plano `clase -> peso` porque es lo que consume
 * `repartirPorClase`. El motor no conoce este paquete: recibe los pesos.
 *
 * `pesos` es el juego de benchmarks con el que se calcula. Sin el manda el de
 * fabrica, que es el del JSON versionado; la pantalla de Macro pasa el suyo.
 */
export function benchmarkDe(
  perfil: Perfil,
  pesos: Benchmarks = benchmarks,
): Record<ClaseModelo, number> {
  return Object.fromEntries(CLASES.map((c) => [c, pesos.clases[c].pesos[perfil]])) as Record<
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
export function pesosDeClase(
  clase: ClaseModelo,
  perfil: Perfil,
  fuente: Benchmarks = benchmarks,
): Record<string, number> {
  const productos = fuente.clases[clase].productos
  const total = productos.reduce((acc, p) => acc + p.pesos[perfil], 0)
  if (total <= 0) return {}
  return Object.fromEntries(productos.map((p) => [p.nombre, p.pesos[perfil] / total]))
}
