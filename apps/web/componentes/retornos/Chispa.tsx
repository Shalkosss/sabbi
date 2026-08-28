'use client'

import { memo } from 'react'

import type { PuntoCrecimiento } from '@sabbi/core'

const ANCHO = 84
const ALTO = 22

/**
 * La forma de la serie, del tamaño de una celda.
 *
 * En una tabla de treinta columnas de cifras, la unica que dice algo de un
 * vistazo es esta: dos fondos con el mismo 12% a 3Y se distinguen acá y en
 * ningun otro lado sin abrir el detalle.
 *
 * Sin ejes, sin rotulos y sin cero: una chispa no es un grafico chico, es la
 * silueta de la serie. Lo que agrega es la forma, y todo lo demas la ensucia.
 * El color lo pone el resultado — verde si termina arriba de donde empezo —
 * porque es lo unico que el trazo por si solo no puede decir en 84 pixeles.
 */
export const Chispa = memo(function Chispa({
  puntos,
  titulo,
}: {
  readonly puntos: readonly PuntoCrecimiento[]
  readonly titulo?: string | undefined
}) {
  if (puntos.length < 2) return <span aria-hidden="true" />

  const indices = puntos.map((p) => p.indice)
  const techo = Math.max(...indices)
  const piso = Math.min(...indices)
  const rango = techo - piso || 1

  const camino = puntos
    .map((p, i) => {
      const x = (i / (puntos.length - 1)) * (ANCHO - 2) + 1
      const y = ALTO - 2 - ((p.indice - piso) / rango) * (ALTO - 4)
      return `${i === 0 ? 'M' : 'L'}${x.toFixed(1)} ${y.toFixed(1)}`
    })
    .join(' ')

  const gano = indices.at(-1)! >= indices[0]!

  return (
    <svg
      viewBox={`0 0 ${ANCHO} ${ALTO}`}
      width={ANCHO}
      height={ALTO}
      role="img"
      aria-label={titulo ?? 'Forma de la serie'}
      style={{ display: 'block', overflow: 'visible' }}
    >
      <path
        d={camino}
        fill="none"
        stroke={gano ? 'var(--acento)' : 'var(--alerta)'}
        strokeWidth={1.4}
        strokeLinejoin="round"
        strokeLinecap="round"
      />
    </svg>
  )
})
