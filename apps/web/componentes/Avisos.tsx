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
   * Identificador de la ficha para recordar los silenciados y las notas.
   * Con `null` no se guarda nada — la × y las notas no aparecen.
   */
  readonly fichaId?: string | null
}

const MOTIVOS: Readonly<Record<string, string>> = {
  sin_valor: 'sin valor',
  sin_nombre: 'sin nombre',
}

const firmaAviso = (aviso: Aviso): string =>
  `${aviso.codigo}|${aviso.fila ?? '·'}|${aviso.mensaje}`

const CLAVE_SIL = (fichaId: string) => `sabbi:avisos-silenciados:${fichaId}`
const CLAVE_NOTAS = (fichaId: string) => `sabbi:avisos-notas:${fichaId}`

const hayFicha = (fichaId: string | null | undefined): fichaId is string =>
  fichaId !== null && fichaId !== undefined && fichaId !== ''

interface Nota {
  readonly id: string
  readonly texto: string
}

/**
 * Silenciados y notas viven en `localStorage` — decisiones de vista, no datos
 * del cliente. Se comparten por ficha entre navegadores del mismo asesor.
 */
function useLocal<T>(clave: string | null, parsear: (crudo: unknown) => T, vacio: T) {
  const [valor, setValor] = useState<T>(() => vacio)

  useEffect(() => {
    if (clave === null) return
    try {
      const guardado = window.localStorage.getItem(clave)
      if (guardado === null) return
      setValor(parsear(JSON.parse(guardado) as unknown))
    } catch {
      /* localStorage bloqueado o JSON invalido: arranca vacio. */
    }
  }, [clave, parsear])

  const guardar = (proximo: T) => {
    setValor(proximo)
    if (clave === null) return
    try {
      window.localStorage.setItem(clave, JSON.stringify(proximo))
    } catch {
      /* sin persistencia; el cambio dura el render */
    }
  }

  return [valor, guardar] as const
}

/**
 * Lo que hay que mirar antes de calcular.
 *
 * Tres niveles del parser (bloqueo, aviso, fila ignorada) y dos anexos del
 * asesor sobre esta ficha: cerrar los avisos ya revisados y agregar notas
 * propias que aparezcan la proxima vez que abra la ficha.
 */
export function Avisos({ bloqueos, avisos, ignoradas, fichaId }: Props) {
  const claveSil = hayFicha(fichaId) ? CLAVE_SIL(fichaId) : null
  const claveNotas = hayFicha(fichaId) ? CLAVE_NOTAS(fichaId) : null

  const [silenciadosArray, guardarSil] = useLocal<readonly string[]>(
    claveSil,
    (c) => (Array.isArray(c) ? c.filter((x): x is string => typeof x === 'string') : []),
    [],
  )
  const [notas, guardarNotas] = useLocal<readonly Nota[]>(
    claveNotas,
    (c) =>
      Array.isArray(c)
        ? c.filter(
            (n): n is Nota =>
              typeof n === 'object' &&
              n !== null &&
              typeof (n as Nota).id === 'string' &&
              typeof (n as Nota).texto === 'string',
          )
        : [],
    [],
  )

  const [redactando, setRedactando] = useState(false)
  const [borrador, setBorrador] = useState('')

  const silenciados = new Set(silenciadosArray)
  const visibles = avisos.filter((aviso) => !silenciados.has(firmaAviso(aviso)))
  const puedeUsarlas = hayFicha(fichaId)

  const silenciar = (firma: string) => guardarSil([...silenciadosArray, firma])
  const restaurar = () => guardarSil([])
  const agregarNota = (texto: string) => {
    const t = texto.trim()
    if (t === '') return
    guardarNotas([...notas, { id: crypto.randomUUID(), texto: t }])
  }
  const borrarNota = (id: string) => guardarNotas(notas.filter((n) => n.id !== id))

  const confirmar = () => {
    agregarNota(borrador)
    setBorrador('')
    setRedactando(false)
  }

  const nada =
    bloqueos.length === 0 &&
    visibles.length === 0 &&
    ignoradas.length === 0 &&
    silenciadosArray.length === 0 &&
    notas.length === 0 &&
    !redactando

  if (nada && !puedeUsarlas) return null

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
            {puedeUsarlas && (
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

      {notas.map((nota) => (
        <p key={nota.id} className={`${estilos.aviso} ${estilos.nota}`}>
          <span className={estilos.notaEtiqueta}>nota</span>
          <span className={estilos.mensaje}>{nota.texto}</span>
          {puedeUsarlas && (
            <button
              type="button"
              className={estilos.cerrar}
              aria-label="Borrar esta nota"
              title="Borrar esta nota"
              onClick={() => borrarNota(nota.id)}
            >
              ×
            </button>
          )}
        </p>
      ))}

      {puedeUsarlas && redactando && (
        <div className={`${estilos.aviso} ${estilos.nota} ${estilos.notaEdicion}`}>
          <span className={estilos.notaEtiqueta}>nota</span>
          <textarea
            className={estilos.notaCampo}
            autoFocus
            rows={2}
            value={borrador}
            placeholder="Escribí una nota para esta ficha"
            onChange={(e) => setBorrador(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) confirmar()
              if (e.key === 'Escape') {
                setBorrador('')
                setRedactando(false)
              }
            }}
          />
          <div className={estilos.notaAcciones}>
            <button
              type="button"
              className={estilos.notaGuardar}
              onClick={confirmar}
              disabled={borrador.trim() === ''}
            >
              Agregar
            </button>
            <button
              type="button"
              className={estilos.notaCancelar}
              onClick={() => {
                setBorrador('')
                setRedactando(false)
              }}
            >
              Cancelar
            </button>
          </div>
        </div>
      )}

      {puedeUsarlas && !redactando && (
        <button
          type="button"
          className={estilos.agregarNota}
          onClick={() => setRedactando(true)}
        >
          + Agregar una nota
        </button>
      )}

      {puedeUsarlas && silenciadosArray.length > 0 && (
        <p className={estilos.restaurar}>
          {silenciadosArray.length === 1
            ? 'Cerraste 1 aviso en esta ficha.'
            : `Cerraste ${silenciadosArray.length} avisos en esta ficha.`}{' '}
          <button
            type="button"
            className={estilos.restaurarBoton}
            onClick={restaurar}
            title="Volver a mostrar los avisos cerrados"
          >
            Restaurar
          </button>
        </p>
      )}

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
