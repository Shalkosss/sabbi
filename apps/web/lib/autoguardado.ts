'use client'

import { useEffect, useMemo, useRef, useState } from 'react'

import { COLA_LIMPIA, crearCola } from './cola'
import type { EstadoCola, Enviar } from './cola'

/**
 * La cola de autoguardado, atada al ciclo de vida de la pantalla.
 *
 * Lo único que agrega sobre `crearCola` es lo que necesita un navegador: que
 * lo pendiente salga si el asesor cierra la pestaña o navega a otra ficha en
 * medio de una corrección.
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

  useEffect(() => {
    const vaciar = () => cola.vaciar()
    window.addEventListener('pagehide', vaciar)

    return () => {
      window.removeEventListener('pagehide', vaciar)
      // Al desmontar se manda lo pendiente en vez de descartarlo: el asesor
      // acaba de escribirlo y no tiene por qué saber que había un retardo.
      cola.vaciar()
    }
  }, [cola])

  return { estado, encolar: cola.encolar }
}
