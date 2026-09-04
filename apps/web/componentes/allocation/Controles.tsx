'use client'

import { PERFILES } from '@sabbi/core'
import type { Perfil } from '@sabbi/core'
import { usePathname, useRouter, useSearchParams } from 'next/navigation'
import { useTransition } from 'react'

import { ASIGNACIONES } from '../../lib/allocation-escala'
import estilos from './Controles.module.css'

/**
 * Las tres palancas: perfil, mezcla y cuánto va a alternativos.
 *
 * Se corren solas, sin botón de recalcular. La pantalla entera existe para
 * mover el slider y ver qué pasa; poner un gesto entre el movimiento y la
 * respuesta convierte una exploración en un trámite.
 *
 * El estado vive en la URL y no acá, igual que en el benchmark: así una
 * corrida se pega en un mensaje y el otro ve exactamente la misma. Por eso
 * `replace` y no `push` — mover el slider seis veces no son seis pasos de
 * historial que el cliente tenga que deshacer uno por uno.
 */
export function Controles({
  perfil,
  mezcla,
  mezclas,
  asignacion,
}: {
  readonly perfil: Perfil
  readonly mezcla: string
  readonly mezclas: readonly string[]
  readonly asignacion: number
}) {
  const router = useRouter()
  const ruta = usePathname()
  const parametros = useSearchParams()
  const [pendiente, empezar] = useTransition()

  const ir = (clave: string, valor: string) => {
    const nuevos = new URLSearchParams(parametros.toString())
    nuevos.set(clave, valor)
    empezar(() => router.replace(`${ruta}?${nuevos.toString()}`))
  }

  const paso = Math.max(ASIGNACIONES.indexOf(asignacion), 0)

  return (
    <div className={estilos.bloque} data-pendiente={pendiente ? '' : undefined}>
      <label className={estilos.campo}>
        <span>Perfil de riesgo</span>
        <select value={perfil} onChange={(e) => ir('perfil', e.target.value)}>
          {PERFILES.map((p) => (
            <option key={p} value={p}>
              {p}
            </option>
          ))}
        </select>
      </label>

      <label className={estilos.campo}>
        <span>Mezcla de alternativos</span>
        <select value={mezcla} onChange={(e) => ir('mezcla', e.target.value)}>
          {mezclas.map((m) => (
            <option key={m} value={m}>
              {m}
            </option>
          ))}
        </select>
      </label>

      <div className={estilos.campo}>
        <span>Asignación a alternativos</span>

        {/*
          El slider va por índice y no por porcentaje: los pasos son los cinco
          que la mesa mira, y un `step` de 10 sobre un rango de 10 a 50 deja
          que el teclado se pare en 15 — una posición que la escala de abajo no
          rotula y que nadie pidió.
        */}
        <input
          type="range"
          min={0}
          max={ASIGNACIONES.length - 1}
          step={1}
          value={paso}
          aria-label="Asignación a alternativos"
          aria-valuetext={`${Math.round(asignacion * 100)}%`}
          onChange={(e) =>
            ir('alt', String(Math.round((ASIGNACIONES[Number(e.target.value)] ?? 0.1) * 100)))
          }
        />

        <div className={estilos.escala} aria-hidden="true">
          {ASIGNACIONES.map((valor) => (
            <button
              key={valor}
              type="button"
              className={valor === asignacion ? estilos.puesto : undefined}
              onClick={() => ir('alt', String(Math.round(valor * 100)))}
            >
              {Math.round(valor * 100)}%
            </button>
          ))}
        </div>
      </div>
    </div>
  )
}
