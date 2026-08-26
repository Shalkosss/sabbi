'use client'

import { useRouter } from 'next/navigation'
import { createContext, useContext, useEffect, useRef } from 'react'
import type { ReactNode } from 'react'

import { useCompania } from '../../lib/tiempo-real'

/**
 * La propuesta atada a la sala de su ficha.
 *
 * Las dos pantallas miran lo mismo desde distinto lado y ninguna se enteraba de
 * la otra. Una propuesta borrador no guarda cifras: se arma en el servidor en
 * cada lectura, a partir de la revisión y del mismo motor que corrió el asesor.
 * Eso la deja siempre bien calculada y siempre expuesta a quedar vieja, porque
 * mientras uno la lee el otro está corrigiendo la ficha de la que sale.
 *
 * Va en las dos direcciones:
 *
 *  - **De la ficha a la propuesta**, con `router.refresh()`, que vuelve a
 *    ejecutar los componentes de servidor y mezcla el resultado sin tocar el
 *    estado del navegador: lo que alguien esté escribiendo en una anotación no
 *    se pierde en la actualización.
 *  - **De la propuesta a la ficha**, con `avisar()`, que es lo que llama el
 *    botón de publicar. Publicar congela los parámetros y abrir una versión
 *    nueva mueve el id al que van a parar los guardados; una ficha abierta que
 *    no se entera de ninguna de las dos cosas se lo descubre de a un error por
 *    tecla.
 *
 * No se anuncia en la sala. Quien lee la propuesta no está en la ficha, y
 * ponerlo en la lista de presentes —con su cursor y todo— le diría a los dos
 * asesores algo que no es cierto.
 */

const Sala = createContext<{ readonly avisar: () => void }>({ avisar: () => undefined })

/** Para avisarle a la ficha desde cualquier parte de la propuesta. */
export const usarSalaDeLaFicha = () => useContext(Sala)

interface Props {
  readonly fichaId: string
  /**
   * Volver a pedir la página cuando la ficha cambie.
   *
   * En `false` para una propuesta publicada: sale del snapshot y no cambia
   * aunque la ficha cambie, así que refrescarla sería pedirle al servidor lo
   * mismo una y otra vez. La sala se abre igual, porque desde una publicada
   * todavía se abre una versión nueva y de eso la ficha sí tiene que enterarse.
   */
  readonly seguir: boolean
  readonly children: ReactNode
}

export function SeguirFicha({ fichaId, seguir, children }: Props) {
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
    if (!seguir) return
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

  const { avisar } = useCompania({
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

  return <Sala.Provider value={{ avisar }}>{children}</Sala.Provider>
}
