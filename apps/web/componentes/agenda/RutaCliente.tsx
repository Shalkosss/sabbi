'use client'

import { diaCorto, diaLargo } from '../../lib/agenda'
import type { Dia, Ruta } from '../../lib/agenda'
import { plural } from '../../lib/formato'
import { pinta } from './tono'
import estilos from './Agenda.module.css'

/**
 * La ruta de un cliente, en una cinta de cinco nodos.
 *
 * Es el degradado de difusión dicho de una sola vez: el nodo de hoy es sólido,
 * y los que vienen se van disolviendo hasta la entrega. La línea que los une
 * se desvanece con ellos — el camino existe, pero de acá en adelante es una
 * intención, no un hecho.
 *
 * Apretar el nombre enciende esa ruta en todo el calendario; apretar un nodo
 * abre ese día en el panel. Son las dos preguntas que se hacen mirando esta
 * lista: «¿cómo viene este cliente?» y «¿qué había ese día?».
 */
export function RutaCliente({
  ruta,
  hoy,
  enfocada,
  atenuada,
  alEnfocar,
  alElegirDia,
}: {
  readonly ruta: Ruta
  readonly hoy: Dia
  readonly enfocada: boolean
  readonly atenuada: boolean
  readonly alEnfocar: (fichaId: string | null) => void
  readonly alElegirDia: (dia: Dia) => void
}) {
  return (
    <li
      className={estilos.tarjetaRuta}
      style={pinta(ruta.tono)}
      data-enfocada={enfocada || undefined}
      data-atenuada={atenuada || undefined}
      onMouseEnter={() => alEnfocar(ruta.fichaId)}
      onMouseLeave={() => alEnfocar(null)}
    >
      <button
        type="button"
        className={estilos.cabezaRuta}
        aria-pressed={enfocada}
        onClick={() => alEnfocar(enfocada ? null : ruta.fichaId)}
      >
        <span className={estilos.avatarRuta} aria-hidden="true">
          {ruta.iniciales}
        </span>
        <span className={estilos.identidadRuta}>
          <span className={estilos.nombreRuta}>{ruta.cliente}</span>
          <span className={estilos.metaRuta}>
            Entrega el {diaCorto(ruta.entrega)} · {restante(ruta)}
          </span>
        </span>
        {ruta.atrasados > 0 && (
          <span className={estilos.insignia}>{ruta.atrasados} sin marcar</span>
        )}
      </button>

      <span className={estilos.cinta}>
        {ruta.hitos.map((hito) => (
          <button
            key={hito.clave}
            type="button"
            className={estilos.nodo}
            style={pinta(ruta.tono, hito.certeza)}
            data-estado={hito.estado}
            data-hoy={hito.dia === hoy || undefined}
            onClick={() => alElegirDia(hito.dia)}
            title={`${hito.titulo} — ${diaLargo(hito.dia)}`}
            aria-label={`${ruta.cliente}: ${hito.titulo}, ${diaLargo(hito.dia)}`}
          >
            <span className={estilos.nodoPunto} aria-hidden="true" />
            <span className={estilos.nodoRotulo}>{hito.corto}</span>
          </button>
        ))}
      </span>
    </li>
  )
}

/** Cuánto queda de plazo, dicho como lo diría la mesa. */
function restante(ruta: Ruta): string {
  const faltan = ruta.faltanParaEntrega
  if (faltan === 0) return 'es hoy'
  if (faltan > 0) return `faltan ${plural(faltan, 'día hábil', 'días hábiles')}`
  return `venció hace ${plural(-faltan, 'día hábil', 'días hábiles')}`
}
