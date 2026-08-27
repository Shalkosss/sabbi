'use client'

import Link from 'next/link'

import { diaCorto, diaLargo, nombreDeDiaSemana } from '../../lib/agenda'
import type { ClaveHito, Ruta } from '../../lib/agenda'
import { plural } from '../../lib/formato'
import { pinta } from './tono'
import estilos from './Agenda.module.css'

/**
 * Una ruta abierta, con todo lo que se hace sobre ella.
 *
 * Es la ficha de trabajo de la agenda: el calendario dice cuándo, y acá se ve
 * en qué anda y se marca lo que ya está. Cerrada muestra lo que se contesta de
 * un vistazo —cuánto falta, cuánto se atrasó y por dónde va la cinta—; abierta,
 * los cinco hitos con su fecha y su casilla.
 *
 * Se abre una a la vez. Cinco tarjetas desplegadas son una lista que hay que
 * recorrer con scroll para encontrar la que importaba.
 */

interface Props {
  readonly ruta: Ruta
  /** Ancla para que el calendario pueda traer esta tarjeta a la vista. */
  readonly id: string
  readonly abierta: boolean
  readonly atenuada: boolean
  readonly esAdmin: boolean
  /** Falso mientras la base no tenga la tabla de hitos. */
  readonly puedeMarcar: boolean
  readonly guardando: boolean
  readonly alAbrir: (fichaId: string | null) => void
  readonly alEnfocar: (fichaId: string | null) => void
  readonly alAlternar: (ruta: Ruta, hito: ClaveHito, hecho: boolean) => void
}

export function RutaCliente({
  ruta,
  id,
  abierta,
  atenuada,
  esAdmin,
  puedeMarcar,
  guardando,
  alAbrir,
  alEnfocar,
  alAlternar,
}: Props) {
  const suya = ruta.mio || esAdmin

  return (
    <li
      id={id}
      className={estilos.tarjetaRuta}
      style={pinta(ruta.tono)}
      data-abierta={abierta || undefined}
      data-atenuada={atenuada || undefined}
      data-vencida={ruta.vencida || undefined}
      onMouseEnter={() => alEnfocar(ruta.fichaId)}
      onMouseLeave={() => alEnfocar(null)}
    >
      <button
        type="button"
        className={estilos.cabezaRuta}
        aria-expanded={abierta}
        onClick={() => alAbrir(abierta ? null : ruta.fichaId)}
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
        <span className={estilos.chevron} aria-hidden="true">
          {abierta ? '▾' : '▸'}
        </span>
      </button>

      <span className={estilos.cinta} aria-hidden="true">
        {ruta.hitos.map((hito) => (
          <span
            key={hito.clave}
            className={estilos.nodo}
            style={pinta(ruta.tono, hito.certeza)}
            data-estado={hito.estado}
          >
            <span className={estilos.nodoPunto} />
            <span className={estilos.nodoRotulo}>{hito.corto}</span>
          </span>
        ))}
      </span>

      {abierta && (
        <div className={estilos.detalleRuta}>
          <ol className={estilos.hitosRuta}>
            {ruta.hitos.map((hito) => {
              const cumplido = hito.estado === 'hecho'
              const marcable = puedeMarcar && suya && hito.clave !== 'ficha'

              return (
                <li
                  key={hito.clave}
                  className={estilos.hitoRuta}
                  style={pinta(ruta.tono, hito.certeza)}
                  data-estado={hito.estado}
                >
                  <span className={estilos.fechaHito}>
                    <span className={estilos.diaHito}>{diaCorto(hito.dia)}</span>
                    <span className={estilos.semanaHito}>
                      {nombreDeDiaSemana(hito.dia).slice(0, 3)}
                    </span>
                  </span>

                  <span className={estilos.cuerpoHito}>
                    <span className={estilos.tituloHito}>{hito.titulo}</span>
                    <span className={estilos.detalleHito}>
                      {hito.clave === 'ficha' ? 'Desde acá corre el plazo.' : hito.detalle}
                    </span>
                  </span>

                  {hito.clave === 'ficha' ? (
                    <span className={estilos.selloHito}>Subida</span>
                  ) : marcable ? (
                    <label
                      className={estilos.casilla}
                      title={`Marcar «${hito.titulo}» como cumplido`}
                    >
                      <input
                        type="checkbox"
                        checked={cumplido}
                        disabled={guardando}
                        onChange={(evento) =>
                          alAlternar(ruta, hito.clave, evento.target.checked)
                        }
                      />
                      <span>{cumplido ? 'Hecho' : 'Marcar'}</span>
                    </label>
                  ) : (
                    <span className={estilos.selloHito} data-estado={hito.estado}>
                      {cumplido ? 'Hecho' : hito.estado === 'vencido' ? 'Vencido' : 'Pendiente'}
                    </span>
                  )}
                </li>
              )
            })}
          </ol>

          <p className={estilos.pieRuta}>
            <span>
              Ficha del {diaLargo(ruta.inicio)}
              {ruta.asesor !== null && <> · la subió {ruta.asesor}</>}
            </span>
            <Link href={`/fichas/${ruta.fichaId}`} className={estilos.enlaceFicha}>
              Abrir la ficha →
            </Link>
          </p>

          {!suya && puedeMarcar && (
            <p className={estilos.nota}>
              La subió otro asesor, así que sus hitos los marca su dueño o un admin.
            </p>
          )}
        </div>
      )}
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
