/**
 * Cola de autoguardado.
 *
 * El asesor corrige una ficha tecleando; nadie va a apretar "guardar". Cada
 * cambio se acumula por clave — una posición, los parámetros — y sale una sola
 * vez cuando la mano se detiene. Dos reglas que no son negociables: los
 * cambios de una misma clave se funden en vez de pisarse, y nunca hay dos
 * envíos de la misma clave en vuelo a la vez, porque el segundo podría llegar
 * antes que el primero y dejar en la base un valor viejo.
 *
 * Sin React adentro a propósito: así se prueba con temporizadores falsos y sin
 * montar nada.
 */

export interface Resultado {
  readonly error?: string
}

export type Enviar<T> = (clave: string, cambios: T) => Promise<Resultado>

export type FaseCola = 'limpio' | 'guardando' | 'guardado' | 'error'

export interface EstadoCola {
  readonly fase: FaseCola
  /** Claves esperando el retardo o con un envío en vuelo. */
  readonly pendientes: number
  readonly error: string | null
}

export interface Cola<T> {
  readonly encolar: (clave: string, cambios: T) => void
  /** Manda ya lo que esté esperando el retardo. */
  readonly vaciar: () => void
  /** Cancela lo que no salió todavía. Para el desmontaje. */
  readonly detener: () => void
}

export interface OpcionesCola<T> {
  readonly enviar: Enviar<T>
  readonly retardoMs?: number
  readonly alCambiar?: (estado: EstadoCola) => void
}

const LIMPIO: EstadoCola = { fase: 'limpio', pendientes: 0, error: null }

export function crearCola<T extends object>({
  enviar,
  retardoMs = 700,
  alCambiar,
}: OpcionesCola<T>): Cola<T> {
  const acumulado = new Map<string, T>()
  const relojes = new Map<string, ReturnType<typeof setTimeout>>()
  const enVuelo = new Set<string>()

  let guardoAlgo = false
  let error: string | null = null

  const avisar = () => {
    const pendientes = acumulado.size + enVuelo.size
    const fase: FaseCola =
      error !== null ? 'error' : pendientes > 0 ? 'guardando' : guardoAlgo ? 'guardado' : 'limpio'
    alCambiar?.({ fase, pendientes, error })
  }

  const despachar = (clave: string) => {
    relojes.delete(clave)

    // Un envío por clave a la vez. Si el anterior sigue en vuelo, lo que se
    // acumuló espera a que vuelva en lugar de adelantarlo — pero espera al
    // envío, no a otro temporizador: al cerrar la pestaña ningún temporizador
    // llega a dispararse y ese cambio se perdía en silencio. Lo drena el
    // `finally` de abajo.
    if (enVuelo.has(clave)) return

    const cambios = acumulado.get(clave)
    if (cambios === undefined) return

    acumulado.delete(clave)
    enVuelo.add(clave)
    avisar()

    enviar(clave, cambios)
      .then((resultado) => {
        if (resultado.error === undefined) {
          guardoAlgo = true
          error = null
        } else {
          error = resultado.error
        }
      })
      .catch((fallo: unknown) => {
        error = fallo instanceof Error ? fallo.message : 'No pude guardar el cambio.'
      })
      .finally(() => {
        enVuelo.delete(clave)
        // Lo que se acumuló mientras este envío estaba en vuelo sale ahora:
        // la mano ya se detuvo, no hay por qué esperar otro retardo.
        if (acumulado.has(clave) && !relojes.has(clave)) despachar(clave)
        avisar()
      })
  }

  return {
    encolar(clave, cambios) {
      acumulado.set(clave, { ...(acumulado.get(clave) ?? ({} as T)), ...cambios })

      const reloj = relojes.get(clave)
      if (reloj !== undefined) clearTimeout(reloj)
      relojes.set(clave, setTimeout(() => despachar(clave), retardoMs))

      avisar()
    },

    vaciar() {
      for (const [clave, reloj] of [...relojes]) {
        clearTimeout(reloj)
        relojes.delete(clave)
        despachar(clave)
      }
    },

    detener() {
      for (const reloj of relojes.values()) clearTimeout(reloj)
      relojes.clear()
      acumulado.clear()
    },
  }
}

export const COLA_LIMPIA = LIMPIO
