'use client'

import type { Bloqueo } from '@sabbi/core'
import type { Aviso, FilaIgnorada } from '@sabbi/io'

import { plural } from '../lib/formato'
import estilos from './Avisos.module.css'

interface Props {
  readonly bloqueos: readonly Bloqueo[]
  readonly avisos: readonly Aviso[]
  readonly ignoradas: readonly FilaIgnorada[]
}

const MOTIVOS: Readonly<Record<string, string>> = {
  sin_valor: 'sin valor',
  sin_nombre: 'sin nombre',
}

/**
 * Lo que hay que mirar antes de calcular.
 *
 * Tres niveles distintos y separados: lo que bloquea el plan, lo que el parser
 * no pudo dar por seguro, y las filas que quedaron fuera. Ninguno se presenta
 * como un error genérico: cada uno dice qué pasó y qué hacer.
 */
export function Avisos({ bloqueos, avisos, ignoradas }: Props) {
  if (bloqueos.length === 0 && avisos.length === 0 && ignoradas.length === 0) return null

  return (
    <div className={estilos.pila}>
      {bloqueos.map((bloqueo) => (
        <p key={bloqueo.codigo} role="alert" className={estilos.bloqueo}>
          <b>No puedo calcular todavía.</b> {bloqueo.mensaje}
        </p>
      ))}

      {avisos.map((aviso, i) => (
        <p key={`${aviso.codigo}-${i}`} className={estilos.aviso}>
          {aviso.fila !== undefined && <span className={estilos.fila}>fila {aviso.fila}</span>}
          {aviso.mensaje}
        </p>
      ))}

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
