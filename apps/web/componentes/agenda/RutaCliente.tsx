'use client'

import Link from 'next/link'

import { diaCorto, diaLargo } from '../../lib/agenda'
import type { ClaveHito, Ruta } from '../../lib/agenda'
import { plural } from '../../lib/formato'
import { pinta } from './tono'
import estilos from './Agenda.module.css'

/**
 * Una ruta abierta, con todo lo que se hace sobre ella.
 *
 * La tarjeta se lee entera de una vez. Antes escondia sus cinco hitos detras
 * de un desplegable que repetia abajo —con fecha, titulo, detalle y una
 * casilla— lo que la cinta de puntos ya venia diciendo arriba: dos dibujos del
 * mismo estado, y el unico que se podia tocar era el de adentro.
 *
 * Ahora el punto es el control. Se marca un hito apretandolo donde se lo ve, y
 * la fecha va debajo de su rotulo: la ruta se lee y se corrige en el mismo
 * gesto, sin abrir nada.
 *
 * El dia cero no se marca —la ficha esta subida, eso es un hecho— y por eso su
 * punto no es un boton.
 */

interface Props {
  readonly ruta: Ruta
  /** Ancla para que el calendario pueda traer esta tarjeta a la vista. */
  readonly id: string
  /** La trajo a la vista un clic en el calendario. Solo la resalta. */
  readonly resaltada: boolean
  readonly atenuada: boolean
  /** Falso mientras la base no tenga la tabla de hitos. */
  readonly puedeMarcar: boolean
  readonly guardando: boolean
  readonly alEnfocar: (fichaId: string | null) => void
  readonly alAlternar: (ruta: Ruta, hito: ClaveHito, hecho: boolean) => void
}

export function RutaCliente({
  ruta,
  id,
  resaltada,
  atenuada,
  puedeMarcar,
  guardando,
  alEnfocar,
  alAlternar,
}: Props) {
  return (
    <li
      id={id}
      className={estilos.tarjetaRuta}
      style={pinta(ruta.tono)}
      data-resaltada={resaltada || undefined}
      data-atenuada={atenuada || undefined}
      data-vencida={ruta.vencida || undefined}
      onMouseEnter={() => alEnfocar(ruta.fichaId)}
      onMouseLeave={() => alEnfocar(null)}
    >
      <div className={estilos.cabezaRuta}>
        <span className={estilos.avatarRuta} aria-hidden="true">
          {ruta.iniciales}
        </span>
        <span className={estilos.identidadRuta}>
          <Link href={`/fichas/${ruta.fichaId}`} className={estilos.nombreRuta}>
            {ruta.cliente}
          </Link>
          <span className={estilos.metaRuta}>
            Entrega el {diaCorto(ruta.entrega)} · {restante(ruta)}
          </span>
        </span>
        {ruta.atrasados > 0 && (
          <span className={estilos.insignia}>{ruta.atrasados} sin marcar</span>
        )}
      </div>

      <ol className={estilos.cinta}>
        {ruta.hitos.map((hito) => {
          const cumplido = hito.estado === 'hecho'
          /* El hito de la ficha no se marca: se cumple subiendola. */
          const marcable = puedeMarcar && hito.clave !== 'ficha'

          const cuerpo = (
            <>
              <span className={estilos.nodoPunto} />
              <span className={estilos.nodoRotulo}>{hito.corto}</span>
              <span className={estilos.nodoFecha}>{diaCorto(hito.dia)}</span>
            </>
          )

          return (
            <li
              key={hito.clave}
              className={estilos.nodo}
              style={pinta(ruta.tono, hito.certeza)}
              data-estado={hito.estado}
            >
              {marcable ? (
                <button
                  type="button"
                  className={estilos.nodoBoton}
                  disabled={guardando}
                  aria-pressed={cumplido}
                  title={`${hito.titulo} — ${diaLargo(hito.dia)}. ${
                    cumplido ? 'Apretá para desmarcarlo.' : 'Apretá para marcarlo cumplido.'
                  }`}
                  onClick={() => alAlternar(ruta, hito.clave, !cumplido)}
                >
                  {cuerpo}
                </button>
              ) : (
                <span className={estilos.nodoFijo} title={`${hito.titulo} — ${diaLargo(hito.dia)}`}>
                  {cuerpo}
                </span>
              )}
            </li>
          )
        })}
      </ol>
    </li>
  )
}

/** Cuánto queda de plazo, dicho como lo diría la mesa. */
function restante(ruta: Ruta): string {
  if (ruta.avance === 1) return 'entregada'
  const faltan = ruta.faltanParaEntrega
  if (faltan === 0) return 'es hoy'
  if (faltan > 0) return `faltan ${plural(faltan, 'día hábil', 'días hábiles')}`
  return `venció hace ${plural(-faltan, 'día hábil', 'días hábiles')}`
}
