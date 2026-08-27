'use client'

import Link from 'next/link'

import { diaLargo, habilesEntre, nombreDeDiaSemana } from '../../lib/agenda'
import type { ClaveHito, Dia, HitoEnCalendario, Ruta } from '../../lib/agenda'
import { plural } from '../../lib/formato'
import { pinta } from './tono'
import estilos from './Agenda.module.css'

/**
 * El día abierto, hito por hito.
 *
 * La celda del calendario tiene sitio para tres píldoras y para el nombre de
 * nadie; acá entra todo: de quién es cada hito, quién subió la ficha, en qué
 * estado está y el enlace para ir a trabajarla. Es también el único lugar
 * donde se escribe — marcar un hito como cumplido.
 *
 * El día cero no lleva casilla: la ficha está subida, y eso ya lo dice la
 * ficha. Un `check` para confirmar un hecho es una segunda verdad sobre lo
 * mismo, y las dos se pueden contradecir.
 */

interface Props {
  readonly dia: Dia
  readonly hoy: Dia
  readonly entradas: readonly HitoEnCalendario[]
  readonly esAdmin: boolean
  /** Falso mientras la base no tenga la tabla de hitos. */
  readonly puedeMarcar: boolean
  readonly guardando: boolean
  readonly enfocado: string | null
  readonly alEnfocar: (fichaId: string | null) => void
  readonly alAlternar: (ruta: Ruta, hito: ClaveHito, hecho: boolean) => void
}

export function PanelDia({
  dia,
  hoy,
  entradas,
  esAdmin,
  puedeMarcar,
  guardando,
  enfocado,
  alEnfocar,
  alAlternar,
}: Props) {
  const distancia = habilesEntre(hoy, dia)

  return (
    <section className={estilos.bloque} aria-labelledby="dia-abierto">
      <div className={estilos.tituloBloque}>
        <h3 id="dia-abierto">
          <span className={estilos.diaSemana}>{nombreDeDiaSemana(dia)}</span> {diaLargo(dia)}
        </h3>
        <span className={estilos.cuenta}>{distanciaEnPalabras(dia, hoy, distancia)}</span>
      </div>

      {entradas.length === 0 ? (
        <p className={estilos.vacio}>
          Sin hitos este día. Los fines de semana y los feriados nunca los tienen: el plazo corre
          en días hábiles.
        </p>
      ) : (
        <ul className={estilos.hitosDelDia}>
          {entradas.map(({ ruta, hito }) => {
            const cumplido = hito.estado === 'hecho'
            const suyo = ruta.mio || esAdmin
            const marcable = puedeMarcar && suyo && hito.clave !== 'ficha'

            return (
              <li
                key={`${ruta.fichaId}-${hito.clave}`}
                className={estilos.hitoDelDia}
                style={pinta(ruta.tono, hito.certeza)}
                data-estado={hito.estado}
                data-atenuado={(enfocado !== null && enfocado !== ruta.fichaId) || undefined}
                onMouseEnter={() => alEnfocar(ruta.fichaId)}
                onMouseLeave={() => alEnfocar(null)}
              >
                <span className={estilos.avatarPanel} aria-hidden="true">
                  {ruta.iniciales}
                </span>

                <span className={estilos.cuerpoHito}>
                  <Link href={`/fichas/${ruta.fichaId}`} className={estilos.clienteHito}>
                    {ruta.cliente}
                  </Link>
                  <span className={estilos.tituloHito}>{hito.titulo}</span>
                  <span className={estilos.detalleHito}>
                    {hito.detalle}
                    {ruta.asesor !== null && <> · la subió {ruta.asesor}</>}
                  </span>
                </span>

                {hito.clave === 'ficha' ? (
                  <span className={estilos.selloHito}>Subida</span>
                ) : marcable ? (
                  <label className={estilos.casilla}>
                    <input
                      type="checkbox"
                      checked={cumplido}
                      disabled={guardando}
                      onChange={(evento) => alAlternar(ruta, hito.clave, evento.target.checked)}
                    />
                    <span>{cumplido ? 'Cumplido' : 'Marcar'}</span>
                  </label>
                ) : (
                  <span className={estilos.selloHito} data-estado={hito.estado}>
                    {cumplido ? 'Cumplido' : hito.estado === 'vencido' ? 'Vencido' : 'Pendiente'}
                  </span>
                )}
              </li>
            )
          })}
        </ul>
      )}
    </section>
  )
}

/** «Hoy», «en 3 días hábiles», «hace 2 días hábiles». */
function distanciaEnPalabras(dia: Dia, hoy: Dia, distancia: number): string {
  if (dia === hoy) return 'Hoy'
  if (distancia === 0) return dia > hoy ? 'Este fin de semana' : 'El fin de semana pasado'
  return distancia > 0
    ? `En ${plural(distancia, 'día hábil', 'días hábiles')}`
    : `Hace ${plural(-distancia, 'día hábil', 'días hábiles')}`
}
