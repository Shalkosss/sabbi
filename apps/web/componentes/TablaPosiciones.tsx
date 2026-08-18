'use client'

import type { Cta } from '@sabbi/core'

import type { PosicionEditada } from '../lib/estado'
import { usd } from '../lib/formato'
import { FilaPosicion } from './FilaPosicion'
import estilos from './TablaPosiciones.module.css'

interface Props {
  readonly posiciones: readonly PosicionEditada[]
  readonly editar: (id: string, cambios: Partial<PosicionEditada>) => void
  readonly marcar: (id: string, cta: Cta) => void
}

const COLUMNAS = [
  '#',
  'Institución / Producto',
  'Tipo (ficha)',
  'Asset class',
  'Clase',
  'Moneda',
  'Plaza',
  'Valor (USD)',
  'Rend.',
  'Fee',
  'Decisión',
  'A vender',
  'Notas',
] as const

/**
 * Paso 2: la tabla de trabajo.
 *
 * Densa a propósito — el resto de la pantalla respira, esto no. Todo es
 * editable porque las fichas llegan con errores, y cada celda que el asesor
 * corrige queda con un punto para distinguirla de lo que trajo el archivo.
 */
export function TablaPosiciones({ posiciones, editar, marcar }: Props) {
  const total = posiciones
    .filter((posicion) => posicion.esInvertible)
    .reduce((suma, posicion) => suma + posicion.valorUsd, 0)

  return (
    <div className={estilos.envoltorio}>
      <table className={estilos.tabla}>
        <thead>
          <tr>
            {COLUMNAS.map((columna) => (
              <th key={columna} scope="col">
                {columna}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {posiciones.map((posicion) => (
            <FilaPosicion
              key={posicion.id}
              posicion={posicion}
              editar={(cambios) => editar(posicion.id, cambios)}
              marcar={(cta) => marcar(posicion.id, cta)}
            />
          ))}
        </tbody>
        <tfoot>
          <tr>
            <td colSpan={7}>Patrimonio financiero</td>
            <td className={`${estilos.numerica} mono`}>{usd(total)}</td>
            <td colSpan={5} />
          </tr>
        </tfoot>
      </table>
    </div>
  )
}
