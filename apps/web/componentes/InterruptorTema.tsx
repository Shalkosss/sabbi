'use client'

import { useCallback, useSyncExternalStore } from 'react'

import { EVENTO_TEMA, aplicarTema, temaActual } from '../lib/tema'
import type { Tema } from '../lib/tema'
import estilos from './InterruptorTema.module.css'

const CONSULTA = '(prefers-color-scheme: dark)'

/**
 * El cambio de tema, en la barra superior.
 *
 * Lee el tema del DOM en vez de guardarlo en estado de React: el guion del
 * <head> ya lo dejo puesto antes de que este componente exista, y duplicarlo
 * en un `useState` seria tener dos verdades. `useSyncExternalStore` hidrata
 * con el valor del servidor y se corrige en el primer render del cliente, que
 * es la unica forma de leer el DOM sin que React marque desajuste.
 */
export function InterruptorTema() {
  const suscribir = useCallback((avisar: () => void) => {
    const media = window.matchMedia(CONSULTA)
    media.addEventListener('change', avisar)
    window.addEventListener(EVENTO_TEMA, avisar)
    return () => {
      media.removeEventListener('change', avisar)
      window.removeEventListener(EVENTO_TEMA, avisar)
    }
  }, [])

  const tema = useSyncExternalStore<Tema>(suscribir, temaActual, () => 'claro')
  const oscuro = tema === 'oscuro'

  return (
    <button
      type="button"
      className={estilos.interruptor}
      role="switch"
      aria-checked={oscuro}
      aria-label="Modo oscuro"
      onClick={() => aplicarTema(oscuro ? 'claro' : 'oscuro')}
    >
      <span className={estilos.texto}>{oscuro ? 'Oscuro' : 'Claro'}</span>
      <span className={`${estilos.riel} ${oscuro ? estilos.encendido : ''}`} aria-hidden="true">
        <span className={estilos.perilla} />
      </span>
    </button>
  )
}
