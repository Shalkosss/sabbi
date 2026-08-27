'use client'

import type { HitoEnCalendario } from '../../lib/agenda'
import { pinta } from './tono'
import estilos from './Agenda.module.css'

/**
 * Un hito dentro de una celda del calendario.
 *
 * Tres canales para decir de quién es, y ninguno depende de otro: el color del
 * cliente, sus iniciales y —al apoyar el puntero— toda su ruta encendida
 * mientras el resto se apaga. El texto de la píldora dice qué hito es, que es
 * lo que cambia entre las cinco del mismo cliente.
 *
 * La difusión entra por `--certeza` y toca el relleno y el halo, nunca la
 * tinta: una fecha tentativa se dibuja más suave, no más difícil de leer.
 */
export function Pildora({
  entrada,
  atenuada,
  alEnfocar,
}: {
  readonly entrada: HitoEnCalendario
  readonly atenuada: boolean
  readonly alEnfocar: (fichaId: string | null) => void
}) {
  const { ruta, hito } = entrada

  return (
    <span
      className={estilos.pildora}
      style={pinta(ruta.tono, hito.certeza)}
      data-estado={hito.estado}
      data-compromiso={hito.clave === 'entrega' || undefined}
      data-atenuada={atenuada || undefined}
      onMouseEnter={() => alEnfocar(ruta.fichaId)}
      onMouseLeave={() => alEnfocar(null)}
      title={`${ruta.cliente} — ${hito.titulo}`}
    >
      <span className={estilos.avatarPildora} aria-hidden="true">
        {ruta.iniciales}
      </span>
      <span className={estilos.textoPildora}>{hito.corto}</span>
    </span>
  )
}
