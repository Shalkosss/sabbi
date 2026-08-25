'use client'

import { usePathname, useRouter, useSearchParams } from 'next/navigation'
import { useTransition } from 'react'

import type { Mirada } from '../lib/benchmark'
import estilos from './SelectorMirada.module.css'

/**
 * Con qué corte se mira la matriz.
 *
 * Por clase es el reparto del modelo: siete bloques y sus instrumentos. Por
 * liquidez es el mismo dinero partido en dos —lo que se puede vender cuando
 * uno quiere y lo que no— que es la pregunta que la mesa hace antes de mirar
 * ninguna clase, porque decide si el portafolio aguanta un imprevisto.
 *
 * No son dos cálculos: son los mismos portafolios sumados de otra manera. Por
 * eso es un corte y no una pestaña con su propia corrida — si pudieran
 * discrepar, una de las dos estaría mintiendo.
 *
 * Vive en la URL como todo lo demás de esta pantalla, así que una corrida por
 * liquidez se pega en un mensaje y el otro ve exactamente la misma.
 */
const OPCIONES: readonly { readonly valor: Mirada; readonly texto: string }[] = [
  { valor: 'clase', texto: 'Por clase' },
  { valor: 'liquidez', texto: 'Líquidos e ilíquidos' },
]

export function SelectorMirada({ puesta }: { readonly puesta: Mirada }) {
  const router = useRouter()
  const ruta = usePathname()
  const parametros = useSearchParams()
  const [pendiente, empezar] = useTransition()

  const ir = (mirada: Mirada) => {
    if (mirada === puesta) return

    const nuevos = new URLSearchParams(parametros.toString())
    // Por clase es el estado por defecto: sin el parámetro la URL queda limpia.
    if (mirada === 'clase') nuevos.delete('mirada')
    else nuevos.set('mirada', mirada)

    const consulta = nuevos.toString()
    empezar(() => router.replace(consulta === '' ? ruta : `${ruta}?${consulta}`))
  }

  return (
    <div
      className={estilos.selector}
      role="tablist"
      aria-label="Con qué corte mirar la matriz"
      data-pendiente={pendiente ? '' : undefined}
    >
      {OPCIONES.map((opcion) => (
        <button
          key={opcion.valor}
          type="button"
          role="tab"
          aria-selected={opcion.valor === puesta}
          className={`${estilos.pestana} ${opcion.valor === puesta ? estilos.activa : ''}`}
          onClick={() => ir(opcion.valor)}
        >
          {opcion.texto}
        </button>
      ))}
    </div>
  )
}
