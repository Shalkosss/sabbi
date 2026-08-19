'use client'

import { useEffect, useMemo, useRef, useState } from 'react'

import { COLA_LIMPIA, crearCola } from './cola'
import type { EstadoCola, Enviar } from './cola'

/**
 * La cola de autoguardado, atada al ciclo de vida de la pantalla.
 *
 * Lo único que agrega sobre `crearCola` es lo que necesita un navegador: que
 * lo pendiente salga si el asesor navega a otra ficha en medio de una
 * corrección, y que se le avise antes de cerrar la pestaña si todavía queda
 * algo sin guardar.
 *
 * Ese aviso no es pereza: un guardado va por una acción de servidor y el
 * navegador no garantiza terminar ninguna petición durante el cierre. Se puede
 * empujar la cola —y se empuja—, pero prometer que llegó sería mentir. Es
 * preferible que el asesor lo sepa y espere un segundo.
 */
export function useAutoguardado<T extends object>(
  enviar: Enviar<T>,
  retardoMs?: number,
): { readonly estado: EstadoCola; readonly encolar: (clave: string, cambios: T) => void } {
  const ultimoEnviar = useRef(enviar)
  const [estado, setEstado] = useState<EstadoCola>(COLA_LIMPIA)

  useEffect(() => {
    ultimoEnviar.current = enviar
  })

  const cola = useMemo(
    () =>
      crearCola<T>({
        enviar: (clave, cambios) => ultimoEnviar.current(clave, cambios),
        ...(retardoMs === undefined ? {} : { retardoMs }),
        alCambiar: setEstado,
      }),
    [retardoMs],
  )

  const pendientes = useRef(0)
  pendientes.current = estado.pendientes

  useEffect(() => {
    const vaciar = () => cola.vaciar()

    // `visibilitychange` llega antes y de forma más confiable que `pagehide`
    // —en móvil `pagehide` a veces no llega—, así que la cola se empuja ahí.
    const alOcultarse = () => {
      if (document.visibilityState === 'hidden') cola.vaciar()
    }

    const alCerrar = (evento: BeforeUnloadEvent) => {
      cola.vaciar()
      if (pendientes.current === 0) return
      evento.preventDefault()
    }

    document.addEventListener('visibilitychange', alOcultarse)
    window.addEventListener('pagehide', vaciar)
    window.addEventListener('beforeunload', alCerrar)

    return () => {
      document.removeEventListener('visibilitychange', alOcultarse)
      window.removeEventListener('pagehide', vaciar)
      window.removeEventListener('beforeunload', alCerrar)
      // Al desmontar se manda lo pendiente en vez de descartarlo: el asesor
      // acaba de escribirlo y no tiene por qué saber que había un retardo.
      cola.vaciar()
    }
  }, [cola])

  return { estado, encolar: cola.encolar }
}
