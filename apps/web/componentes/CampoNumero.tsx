'use client'

import { useState } from 'react'

import { desdeInput } from '../lib/formato'

/**
 * Un input numérico que respeta lo que el asesor está tecleando.
 *
 * El problema que resuelve es concreto y caro: si el valor del input se deriva
 * del número guardado, `1000.` vuelve como `1000` — el punto no sobrevive el
 * viaje a número y de vuelta a texto — y React repone ese `1000` en el DOM.
 * El punto desaparece de la pantalla, el siguiente dígito se pega al final, y
 * `1000.50` termina guardado como `100050`. Cien veces más, en un campo de
 * dinero que alimenta el motor.
 *
 * Mientras el campo está enfocado manda el texto tecleado, tal cual. Al salir
 * se suelta y vuelve a mandar el número guardado, ya con su formato canónico.
 * Así se puede escribir un decimal sin pelear, y la celda nunca queda mostrando
 * algo distinto de lo que se va a guardar.
 */
interface Props {
  /** Lo que se muestra cuando el campo no está siendo editado. */
  readonly texto: string
  readonly alCambiar: (valor: number | null) => void
  readonly className?: string
  readonly placeholder?: string
  readonly 'aria-label': string
  readonly 'aria-invalid'?: boolean
}

export function CampoNumero({ texto, alCambiar, ...resto }: Props) {
  const [tecleado, setTecleado] = useState<string | null>(null)

  return (
    <input
      {...resto}
      inputMode="decimal"
      value={tecleado ?? texto}
      onChange={(evento) => {
        setTecleado(evento.target.value)
        alCambiar(desdeInput(evento.target.value))
      }}
      onBlur={() => setTecleado(null)}
    />
  )
}
