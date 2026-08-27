'use client'

import type { CursorAjeno, EstadoCanal } from '../lib/tiempo-real'
import estilos from './Cursores.module.css'

/**
 * Los cursores de quienes están en la misma ficha.
 *
 * Se dibujan sobre el documento entero y no sobre la ventana: las dos pantallas
 * rara vez tienen el mismo tamaño, así que la posición viaja como fracción del
 * documento y se convierte acá. No es exacto al píxel —el alto cambia según
 * cuántos detalles tenga abiertos cada uno— y no hace falta que lo sea: lo que
 * resuelve es «Marco está en esta zona, no metas la mano acá».
 *
 * Nada de esto captura el puntero: `pointer-events: none` en todo el bloque. Un
 * cursor ajeno que se comiera un clic sería peor que no tenerlo.
 */
export function Cursores({ cursores }: { readonly cursores: readonly CursorAjeno[] }) {
  if (cursores.length === 0) return null

  return (
    <div className={estilos.capa} aria-hidden="true">
      {cursores.map((cursor) => (
        <div
          key={cursor.asesorId}
          className={estilos.cursor}
          style={{
            left: `${cursor.x * 100}%`,
            top: `${cursor.y * 100}%`,
            color: `hsl(${cursor.tono} 70% 45%)`,
          }}
        >
          <svg width="16" height="18" viewBox="0 0 16 18" fill="currentColor">
            <path d="M1 1l12 6.5-5.2 1.4L5 16.5z" stroke="white" strokeWidth="1.2" />
          </svg>
          <span
            className={estilos.nombre}
            style={{ background: `hsl(${cursor.tono} 70% 45%)` }}
          >
            {cursor.nombre}
          </span>
        </div>
      ))}
    </div>
  )
}

/**
 * Quiénes más están mirando esta ficha.
 *
 * Va en la barra, al lado del estado de guardado, porque es la misma pregunta:
 * qué le está pasando a esto que estoy editando. Un punto de color por persona,
 * el mismo color que su cursor.
 */
export function Companeros({
  companeros,
}: {
  readonly companeros: readonly { readonly asesorId: string; readonly nombre: string; readonly tono: number }[]
}) {
  if (companeros.length === 0) return null

  return (
    <span className={estilos.companeros}>
      {companeros.map((companero) => (
        <span
          key={companero.asesorId}
          className={estilos.ficha}
          style={{ borderColor: `hsl(${companero.tono} 70% 45%)` }}
          title={`${companero.nombre} está en esta ficha`}
        >
          <span
            className={estilos.punto}
            style={{ background: `hsl(${companero.tono} 70% 45%)` }}
          />
          {companero.nombre}
        </span>
      ))}
    </span>
  )
}

/**
 * Si la ficha está conectada en vivo.
 *
 * Solo aparece cuando algo no anda. En verde no dice nada: un indicador que
 * está siempre encendido deja de leerse a la semana, y lo que importa acá es
 * el caso raro — dos asesores mirándose los cursores que nunca llegan, sin
 * ninguna señal de que el problema no son ellos.
 */
export function EstadoEnVivo({
  estado,
  cambiosEnVivo,
}: {
  readonly estado: EstadoCanal
  readonly cambiosEnVivo: boolean
}) {
  if (estado === 'conectando') return null

  if (estado === 'caido') {
    return (
      <span
        className={estilos.alerta}
        title="No hay conexión en vivo con esta ficha: no vas a ver los cursores ni los cambios de los demás. Lo que guardes se guarda igual; recargá para ver lo que hicieron."
      >
        Sin conexión en vivo
      </span>
    )
  }

  if (!cambiosEnVivo) {
    return (
      <span
        className={estilos.aviso}
        title="Los cursores llegan, pero los cambios guardados por otro asesor no aparecen solos: hay que recargar. Suele ser que falta publicar la tabla por Realtime (migración 0014)."
      >
        Cursores sí, cambios no
      </span>
    )
  }

  return null
}
