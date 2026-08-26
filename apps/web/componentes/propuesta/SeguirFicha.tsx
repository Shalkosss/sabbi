'use client'

import { useRouter } from 'next/navigation'
import { useEffect, useRef } from 'react'

import { useCompania } from '../../lib/tiempo-real'

/**
 * La propuesta que se actualiza sola mientras alguien corrige la ficha.
 *
 * La propuesta no guarda cifras propias: se arma en el servidor en cada
 * lectura, a partir de la revisión y del mismo motor que corrió el asesor. Eso
 * la deja siempre bien calculada y siempre expuesta a quedar vieja — mientras
 * uno la lee, el otro está corrigiendo la ficha de la que sale, y no hay nada
 * en la pantalla que lo diga.
 *
 * Esto escucha la sala de la ficha y pide al servidor que vuelva a armarla. Lo
 * que hace `router.refresh()` es exactamente lo que hace falta: vuelve a
 * ejecutar los componentes de servidor y mezcla el resultado sin tocar el
 * estado del navegador, así que lo que alguien esté escribiendo en una
 * anotación no se pierde en la actualización.
 *
 * No se anuncia en la sala. Quien lee la propuesta no está en la ficha, y
 * ponerlo en la lista de presentes de la ficha —con su cursor y todo— le diría
 * a los dos asesores algo que no es cierto.
 */
export function SeguirFicha({ fichaId }: { readonly fichaId: string }) {
  const router = useRouter()

  /**
   * La espera antes de rearmar.
   *
   * Cada tecla del otro asesor es un `update` publicado, y rearmar la
   * propuesta es correr el motor entero: hacerlo por tecla sería castigar al
   * servidor para mostrar estados intermedios que nadie quiere ver. Se espera
   * a que la otra pantalla pare, y recién ahí se pide de nuevo.
   */
  const espera = useRef<number | null>(null)

  const pedirDeNuevo = () => {
    if (espera.current !== null) window.clearTimeout(espera.current)
    espera.current = window.setTimeout(() => {
      espera.current = null
      router.refresh()
    }, 2_000)
  }

  useEffect(
    () => () => {
      if (espera.current !== null) window.clearTimeout(espera.current)
    },
    [],
  )

  useCompania({
    sala: fichaId === '' ? '' : `ficha:${fichaId}`,
    // El nombre no viaja a ninguna parte: sin `track` no hay presencia que
    // mostrar. Va el id igual para que el eco del propio cursor se descarte.
    yo: { asesorId: '', nombre: '' },
    presente: false,
    alRefrescar: pedirDeNuevo,
    posiciones: {
      fichaId,
      // Nada de esta pantalla se está editando contra la ficha, así que no hay
      // nada que proteger: todo lo que llega se atiende.
      mias: () => new Set<string>(),
      alCambiar: pedirDeNuevo,
    },
  })

  return null
}
