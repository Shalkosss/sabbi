'use client'

import type { CSSProperties } from 'react'

import { DIAS_SEMANA, esHabil, feriado } from '../../lib/agenda'
import type { Dia, Mes as Grilla, Ruta, TramoDeRuta } from '../../lib/agenda'
import { diaCorto } from '../../lib/agenda'
import { pinta } from './tono'
import estilos from './Agenda.module.css'

/**
 * El mes: una barra por cliente, del día que llegó su ficha a la entrega.
 *
 * La primera versión ponía los cinco hitos como píldoras sueltas y un mes con
 * ocho clientes eran cuarenta etiquetas: no se leía ni quién ni cuándo. Acá
 * cada cliente es una sola barra, y lo único que el calendario contesta —que
 * es lo que un calendario tiene que contestar— es cuándo entró cada uno y
 * hasta cuándo hay tiempo. Los cinco hitos con sus fechas viven en «En ruta»,
 * que es donde se trabaja.
 *
 * La barra se va solidificando con los días: lo vivido va firme y lo que falta
 * se disuelve hacia la entrega. El borde derecho es el compromiso, y se marca
 * aunque la barra venga difusa.
 */

interface Props {
  readonly mes: Grilla
  readonly hoy: Dia
  readonly rutas: readonly Ruta[]
  readonly tramos: readonly (readonly TramoDeRuta[])[]
  readonly enfocada: string | null
  readonly alEnfocar: (fichaId: string | null) => void
  readonly alAbrir: (fichaId: string) => void
}

/** Carriles visibles por semana. Lo que no entra se cuenta al pie de la fila. */
const CARRILES = 4

export function Mes({ mes, hoy, rutas, tramos, enfocada, alEnfocar, alAbrir }: Props) {
  const porFicha = new Map(rutas.map((ruta) => [ruta.fichaId, ruta]))

  return (
    <section className={estilos.calendario} aria-label="Calendario de entregas">
      <div className={estilos.semanaCabecera}>
        {DIAS_SEMANA.map((rotulo) => (
          <span key={rotulo} className={estilos.rotuloDia}>
            {rotulo}
          </span>
        ))}
      </div>

      {mes.semanas.map((semana, indice) => {
        const dela = tramos[indice] ?? []
        const visibles = dela.filter((tramo) => tramo.carril < CARRILES)
        const escondidas = new Set(
          dela.filter((tramo) => tramo.carril >= CARRILES).map((tramo) => tramo.fichaId),
        )

        return (
          <div key={semana[0]?.dia} className={estilos.semana}>
            {/* El fondo: los siete días, con sus números y sus rayas. */}
            <div className={estilos.dias}>
              {semana.map((celda) => {
                const nombreFeriado = feriado(celda.dia)
                return (
                  <div
                    key={celda.dia}
                    className={estilos.dia}
                    data-fuera={!celda.delMes || undefined}
                    data-inhabil={!esHabil(celda.dia) || undefined}
                    data-hoy={celda.dia === hoy || undefined}
                  >
                    <span className={`${estilos.numero} mono`}>
                      {Number(celda.dia.slice(8, 10))}
                    </span>
                    {nombreFeriado !== null && (
                      <span className={estilos.feriado} title={nombreFeriado}>
                        {nombreFeriado}
                      </span>
                    )}
                  </div>
                )
              })}
            </div>

            {/* Las barras, en carriles sobre esa misma grilla de siete. */}
            <div className={estilos.carriles}>
              {visibles.map((tramo) => {
                const ruta = porFicha.get(tramo.fichaId)
                if (ruta === undefined) return null

                return (
                  <Barra
                    key={`${tramo.fichaId}-${tramo.desde}`}
                    tramo={tramo}
                    ruta={ruta}
                    atenuada={enfocada !== null && enfocada !== ruta.fichaId}
                    alEnfocar={alEnfocar}
                    alAbrir={alAbrir}
                  />
                )
              })}
            </div>

            {escondidas.size > 0 && (
              <p className={estilos.mas}>
                +{escondidas.size} {escondidas.size === 1 ? 'ruta más' : 'rutas más'} esta semana
              </p>
            )}
          </div>
        )
      })}
    </section>
  )
}

/**
 * Una ruta dentro de una semana.
 *
 * Lleva el nombre del cliente adentro, no unas iniciales: la barra ocupa varios
 * días y hay sitio de sobra. El color distingue dos que se cruzan; el nombre
 * las distingue cuando son veinte.
 */
function Barra({
  tramo,
  ruta,
  atenuada,
  alEnfocar,
  alAbrir,
}: {
  readonly tramo: TramoDeRuta
  readonly ruta: Ruta
  readonly atenuada: boolean
  readonly alEnfocar: (fichaId: string | null) => void
  readonly alAbrir: (fichaId: string) => void
}) {
  const posicion: CSSProperties = {
    ...pinta(ruta.tono),
    gridColumn: `${tramo.desde + 1} / ${tramo.hasta + 2}`,
    gridRow: tramo.carril + 1,
    ['--cubierto' as string]: tramo.cubierto,
  }

  return (
    <button
      type="button"
      className={estilos.barraRuta}
      style={posicion}
      data-abre={tramo.abre || undefined}
      data-cierra={tramo.cierra || undefined}
      data-vencida={ruta.vencida || undefined}
      data-entregada={ruta.avance === 1 || undefined}
      data-atenuada={atenuada || undefined}
      onMouseEnter={() => alEnfocar(ruta.fichaId)}
      onMouseLeave={() => alEnfocar(null)}
      onFocus={() => alEnfocar(ruta.fichaId)}
      onBlur={() => alEnfocar(null)}
      onClick={() => alAbrir(ruta.fichaId)}
      aria-label={`${ruta.cliente}: ficha del ${diaCorto(ruta.inicio)}, entrega el ${diaCorto(ruta.entrega)}${ruta.vencida ? ', vencida' : ''}${ruta.atrasados > 0 ? `, ${ruta.atrasados} hitos sin marcar` : ''}`}
    >
      {tramo.abre && <span className={estilos.puntaBarra} aria-hidden="true" />}
      <span className={estilos.nombreBarra}>{ruta.cliente}</span>
      {tramo.cierra && (
        <span className={estilos.entregaBarra} aria-hidden="true">
          {ruta.vencida ? 'vencida' : diaCorto(ruta.entrega)}
        </span>
      )}
    </button>
  )
}
