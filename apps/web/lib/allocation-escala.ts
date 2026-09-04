/**
 * Las dos constantes de presentación de la pantalla de Allocation.
 *
 * Viven aparte de `allocation.ts` porque el slider es un componente de cliente
 * y `allocation.ts` es `server-only`: las series no bajan al navegador y esa
 * marca es lo que lo garantiza. Importar el módulo entero desde el control
 * arrastraría el motor y la lectura de Supabase al bundle.
 *
 * No son parámetros del modelo. Los pasos son las posiciones que el control
 * sabe dibujar y el monto es la base de la curva; ninguno de los dos cambia
 * una cifra del cálculo, así que no van a la base con los pesos.
 */

/** Los pasos del slider, en fracción. */
export const ASIGNACIONES: readonly number[] = [0.1, 0.2, 0.3, 0.4, 0.5]

/** El monto con el que se dibuja el crecimiento. */
export const MONTO_CURVA = 100_000
