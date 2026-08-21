'use client'

import { PERFILES } from '@sabbi/core'
import type { Perfil } from '@sabbi/core'
import { usePathname, useRouter, useSearchParams } from 'next/navigation'
import { useTransition } from 'react'

import { bandaPerfil, colorPerfil } from '../lib/perfiles'
import estilos from './SelectorPerfiles.module.css'

/**
 * Qué perfiles mirar, uno por uno.
 *
 * Era un desplegable con tres combinaciones fijas y un botón de «volver a
 * correr». Tres combinaciones no son las que hacen falta —la comparación útil
 * casi nunca es la que alguien previó— y el botón hacía que ver otra cosa
 * costara dos gestos en vez de uno.
 *
 * Ahora cada perfil se enciende y se apaga solo, y la corrida sale en el
 * momento. El estado sigue viviendo en la URL y no en la pantalla: así una
 * comparación se pega en un mensaje y el otro ve exactamente la misma. Cada
 * chip lleva el color con el que ese perfil sale en el gráfico, que es lo que
 * hace que la leyenda no haga falta.
 *
 * No se pueden apagar los cinco: una matriz vacía no es una vista, es un
 * error. El último encendido queda fijo y lo dice su `title`.
 */
export function SelectorPerfiles({ elegidos }: { readonly elegidos: readonly Perfil[] }) {
  const router = useRouter()
  const ruta = usePathname()
  const parametros = useSearchParams()
  const [pendiente, empezar] = useTransition()

  const puestos = new Set(elegidos)
  const ultimo = puestos.size === 1

  const alternar = (perfil: Perfil) => {
    const siguientes = new Set(puestos)
    if (siguientes.has(perfil)) siguientes.delete(perfil)
    else siguientes.add(perfil)
    if (siguientes.size === 0) return

    const nuevos = new URLSearchParams(parametros.toString())
    // Los cinco es el estado por defecto: sin el parámetro la URL queda limpia
    // y compartible, que es la que la mesa manda cuando muestra el modelo.
    if (siguientes.size === PERFILES.length) nuevos.delete('perfiles')
    else nuevos.set('perfiles', PERFILES.filter((p) => siguientes.has(p)).join(','))

    const consulta = nuevos.toString()
    empezar(() => router.replace(consulta === '' ? ruta : `${ruta}?${consulta}`))
  }

  // El bloque de reglas es un formulario `get` y este selector vive adentro.
  // Sin este campo, apretar «Volver a correr» mandaria la URL sin `perfiles` y
  // la eleccion se perderia justo al cambiar una regla, que es cuando mas
  // importa no perderla.
  const todos = puestos.size === PERFILES.length

  return (
    <div className={estilos.campo}>
      <span className={estilos.etiqueta}>Perfiles a mirar</span>

      {!todos && (
        <input
          type="hidden"
          name="perfiles"
          value={PERFILES.filter((p) => puestos.has(p)).join(',')}
        />
      )}

      <div
        className={estilos.chips}
        role="group"
        aria-label="Perfiles a mirar"
        data-pendiente={pendiente ? '' : undefined}
      >
        {PERFILES.map((perfil) => {
          const puesto = puestos.has(perfil)
          const clavado = puesto && ultimo

          return (
            <button
              key={perfil}
              type="button"
              aria-pressed={puesto}
              disabled={clavado}
              onClick={() => alternar(perfil)}
              className={`${estilos.chip} ${puesto ? estilos.puesto : ''}`}
              style={{ '--tinte': colorPerfil(perfil), '--banda': bandaPerfil(perfil) } as React.CSSProperties}
              title={
                clavado
                  ? 'Es el único encendido: apagarlo dejaría la matriz vacía.'
                  : puesto
                    ? `Sacar ${perfil} de la comparación`
                    : `Agregar ${perfil} a la comparación`
              }
            >
              <span className={estilos.muestra} aria-hidden="true" />
              {perfil}
            </button>
          )
        })}
      </div>
    </div>
  )
}
