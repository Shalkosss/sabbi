import type { CSSProperties } from 'react'

/**
 * El color de un cliente y la firmeza de un hito, como variables CSS.
 *
 * Van por `style` y no por una clase porque son dos ejes continuos —ocho tonos
 * cruzados con la certeza— y escribir esas combinaciones como clases sería una
 * hoja de estilos enorme para decir lo que dos variables dicen solas. La hoja
 * define qué hace cada una; acá solo se elige el valor.
 */
export const pinta = (tono: number, certeza = 1): CSSProperties =>
  ({
    '--tono': `var(--agenda-tono-${tono})`,
    '--certeza': certeza,
  }) as CSSProperties

/** El primer nombre alcanza en una píldora; el completo va en el panel. */
export const primerNombre = (nombre: string): string => nombre.split(/\s+/)[0] ?? nombre
