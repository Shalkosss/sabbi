'use client'

import { useEffect, useState } from 'react'

import type { Bloqueo } from '@sabbi/core'
import type { Aviso, FilaIgnorada } from '@sabbi/io'

import { plural } from '../lib/formato'
import estilos from './Avisos.module.css'

interface Props {
  readonly bloqueos: readonly Bloqueo[]
  readonly avisos: readonly Aviso[]
  readonly ignoradas: readonly FilaIgnorada[]
  /**
   * Identificador de la ficha para recordar cuales avisos silencio el asesor.
   * Con `null` no se guarda nada — el boton de cerrar no aparece.
   */
  readonly fichaId?: string | null
}

const MOTIVOS: Readonly<Record<string, string>> = {
  sin_valor: 'sin valor',
  sin_nombre: 'sin nombre',
}

/** Identidad estable de un aviso dentro de una ficha. */
const firmaAviso = (aviso: Aviso): string =>
  `${aviso.codigo}|${aviso.fila ?? '·'}|${aviso.mensaje}`

const CLAVE = (fichaId: string) => `sabbi:avisos-silenciados:${fichaId}`

/**
 * Los avisos silenciados por el asesor, para esta ficha, en este navegador.
 *
 * No entra a la base porque `parse_warnings` sigue siendo la foto del parser:
 * si silenciar entrara al servidor, lo que se guarda seria «este asesor decidio
 * que este cartel no volviera a salir en esta pantalla», que no es un dato del
 * cliente. Se guarda en el navegador —una decision de vista— y se comparte por
 * ficha, no por persona: dos asesores mirando la misma ficha ven los mismos
 * avisos vivos porque la ficha es del equipo.
 *
 * Si el localStorage no esta disponible, cae al comportamiento anterior sin
 * romperse: un silencio efimero, que sobrevive el render pero no el reload.
 */
function useSilenciados(fichaId: string | null | undefined) {
  const [silenciados, setSilenciados] = useState<ReadonlySet<string>>(() => new Set())

  useEffect(() => {
    if (fichaId === null || fichaId === undefined || fichaId === '') return
    try {
      const guardado = window.localStorage.getItem(CLAVE(fichaId))
      if (guardado === null) return
      const filas = JSON.parse(guardado) as unknown
      if (Array.isArray(filas)) setSilenciados(new Set(filas.filter((x): x is string => typeof x === 'string')))
    } catch {
      /* localStorage bloqueado o JSON invalido: se ignora y arranca vacio. */
    }
  }, [fichaId])

  const silenciar = (firma: string) => {
    setSilenciados((previas) => {
      const proximas = new Set(previas)
      proximas.add(firma)
      if (fichaId !== null && fichaId !== undefined && fichaId !== '') {
        try {
          window.localStorage.setItem(CLAVE(fichaId), JSON.stringify([...proximas]))
        } catch {
          /* sin persistencia; el silencio dura el render */
        }
      }
      return proximas
    })
  }

  return { silenciados, silenciar }
}

/**
 * Lo que hay que mirar antes de calcular.
 *
 * Tres niveles distintos y separados: lo que bloquea el plan, lo que el parser
 * no pudo dar por seguro, y las filas que quedaron fuera. Ninguno se presenta
 * como un error generico: cada uno dice que paso y que hacer.
 *
 * Un aviso ya resuelto se apaga solo cuando `avisosVigentes` puede comprobarlo
 * contra el estado —la clase esta puesta, el rendimiento se edito—. Los que no
 * se pueden comprobar el asesor los cierra a mano con la ×, y quedan
 * silenciados para esa ficha en su navegador.
 */
export function Avisos({ bloqueos, avisos, ignoradas, fichaId }: Props) {
  const { silenciados, silenciar } = useSilenciados(fichaId)
  const visibles = avisos.filter((aviso) => !silenciados.has(firmaAviso(aviso)))

  if (bloqueos.length === 0 && visibles.length === 0 && ignoradas.length === 0) return null

  const puedeSilenciar = fichaId !== null && fichaId !== undefined && fichaId !== ''

  return (
    <div className={estilos.pila}>
      {bloqueos.map((bloqueo) => (
        <p key={bloqueo.codigo} role="alert" className={estilos.bloqueo}>
          <b>No puedo calcular todavía.</b> {bloqueo.mensaje}
        </p>
      ))}

      {visibles.map((aviso, i) => {
        const firma = firmaAviso(aviso)
        return (
          <p key={`${aviso.codigo}-${aviso.fila ?? 'x'}-${i}`} className={estilos.aviso}>
            {aviso.fila !== undefined && <span className={estilos.fila}>fila {aviso.fila}</span>}
            <span className={estilos.mensaje}>{aviso.mensaje}</span>
            {puedeSilenciar && (
              <button
                type="button"
                className={estilos.cerrar}
                aria-label="Cerrar este aviso"
                title="Ya lo revisé — que no vuelva a salir en esta ficha"
                onClick={() => silenciar(firma)}
              >
                ×
              </button>
            )}
          </p>
        )
      })}

      {ignoradas.length > 0 && (
        <details className={estilos.ignoradas}>
          <summary>
            {plural(ignoradas.length, 'fila ignorada', 'filas ignoradas')} — no entran al cálculo
          </summary>
          <ul>
            {ignoradas.map((ignorada) => (
              <li key={`${ignorada.origen}-${ignorada.fila}`}>
                <span className={estilos.fila}>fila {ignorada.fila}</span>
                {ignorada.institucionProducto === ''
                  ? '(sin nombre)'
                  : ignorada.institucionProducto}{' '}
                <span className={estilos.motivo}>
                  {MOTIVOS[ignorada.motivo] ?? ignorada.motivo}
                </span>
              </li>
            ))}
          </ul>
        </details>
      )}
    </div>
  )
}
