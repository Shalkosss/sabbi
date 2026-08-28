import type { FichaFondo, ObservacionMensual } from '@sabbi/core'

/**
 * Qué tiene la matriz de retornos, y por qué no tiene nada cuando no tiene.
 *
 * Vive fuera de `datos/retornos.ts` —que es `server-only`— porque es lógica
 * pura sobre lo que la base devolvió: no consulta nada y se prueba sin montar
 * un cliente de Supabase. La lectura sigue estando allá; acá está el criterio.
 */

export interface FondoConSerie {
  readonly ficha: FichaFondo
  readonly activo: boolean
  readonly observaciones: readonly ObservacionMensual[]
}

/**
 * Por qué la matriz de retornos está vacía.
 *
 * Existe porque «no hay fondos» y «la consulta falló» se veían exactamente
 * igual en pantalla: una tabla vacía con un texto que decía «todavía no hay
 * fondos cargados». Eso es cierto solo en uno de los tres casos, y en los
 * otros dos manda a la mesa a cargar a mano cuatro mil observaciones que ya
 * existen en el libro — o a esperar un dato que la base sí guarda pero que la
 * consulta no pudo leer.
 *
 * `null` es que la lectura anduvo y hay algo que mostrar.
 */
export type FaltaRetornos =
  | { readonly motivo: 'consulta'; readonly detalle: string }
  | { readonly motivo: 'sin-fondos' }
  | { readonly motivo: 'sin-observaciones' }
  | null

/**
 * El diagnóstico, a partir de lo que devolvió la base.
 *
 * El error gana sobre todo lo demás. Un `select` contra una tabla que no
 * existe devuelve cero filas igual que una tabla vacía, y si el orden fuera al
 * revés la pantalla mandaría a importar el libro a una base que todavía no
 * tiene dónde ponerlo.
 *
 * Un solo fondo con serie ya alcanza: un fondo dado de alta el mes pasado y
 * todavía sin cargar no puede vaciar la pantalla de los otros cincuenta.
 */
export function diagnosticar(
  error: string | null,
  fondos: readonly FondoConSerie[],
): FaltaRetornos {
  if (error !== null) return { motivo: 'consulta', detalle: error }
  if (fondos.length === 0) return { motivo: 'sin-fondos' }
  if (fondos.every((fondo) => fondo.observaciones.length === 0)) {
    return { motivo: 'sin-observaciones' }
  }
  return null
}
