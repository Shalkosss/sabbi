'use client'

import type { Cta } from '@sabbi/core'
import { useState } from 'react'

import type { PosicionEditada } from '../lib/estado'
import { plural, usd } from '../lib/formato'
import type { ProductoOfrecible } from '../lib/catalogo'
import { FilaPosicion } from './FilaPosicion'
import estilos from './TablaPosiciones.module.css'

interface Props {
  readonly posiciones: readonly PosicionEditada[]
  /** El menú del catálogo, para los destinos de una venta condicionada. */
  readonly productos: readonly ProductoOfrecible[]
  readonly editar: (id: string, cambios: Partial<PosicionEditada>) => void
  readonly marcar: (id: string, cta: Cta) => void
}

const COLUMNAS = [
  { texto: '', clase: estilos.colIndice, alinea: estilos.derecha },
  { texto: 'Institución y producto', clase: estilos.colNombre, alinea: undefined },
  { texto: 'Clase', clase: estilos.colClase, alinea: undefined },
  { texto: 'Valor USD', clase: estilos.colValor, alinea: estilos.derecha },
  { texto: 'Rend.', clase: estilos.colRend, alinea: estilos.derecha },
  { texto: 'Decisión', clase: estilos.colCta, alinea: undefined },
  { texto: '', clase: estilos.colChevron, alinea: undefined },
] as const

/**
 * La tabla de trabajo.
 *
 * Seis columnas a la vista, no trece. En la fila queda lo que se corrige a
 * cada rato — el nombre, la clase, el valor, la decision — y lo demas baja al
 * detalle, que se abre por fila. La ficha llega con errores y la tabla existe
 * para arreglarlos, pero trece campos abiertos a la vez no se leen: se
 * escanean mal y se tocan por accidente.
 */
export function TablaPosiciones({ posiciones, productos, editar, marcar }: Props) {
  const [abierta, setAbierta] = useState<string | null>(null)

  const financieras = posiciones.filter((posicion) => posicion.origen === 'financiero').length
  const inmuebles = posiciones.length - financieras
  const total = posiciones
    .filter((posicion) => posicion.esInvertible)
    .reduce((suma, posicion) => suma + posicion.valorUsd, 0)

  return (
    <section className={estilos.bloque} aria-label="Posiciones de la ficha">
      <div className={estilos.encabezado}>
        <p className={estilos.conteo}>
          {plural(financieras, 'financiera', 'financieras')}, {plural(inmuebles, 'inmueble', 'inmuebles')}
        </p>
        <p className={estilos.total}>
          Patrimonio financiero <b className="mono">{usd(total)}</b>
        </p>
      </div>

      <div className={estilos.envoltorio}>
        <table className={estilos.tabla}>
          <colgroup>
            {COLUMNAS.map((columna, i) => (
              <col key={i} className={columna.clase} />
            ))}
          </colgroup>
          <thead>
            <tr>
              {COLUMNAS.map((columna, i) => (
                <th key={i} scope="col" className={columna.alinea}>
                  {columna.texto}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {posiciones.map((posicion) => (
              <FilaPosicion
                key={posicion.id}
                posicion={posicion}
                productos={productos}
                abierta={abierta === posicion.id}
                alternar={() => setAbierta((previa) => (previa === posicion.id ? null : posicion.id))}
                editar={(cambios) => editar(posicion.id, cambios)}
                marcar={(cta) => marcar(posicion.id, cta)}
              />
            ))}
          </tbody>
        </table>
      </div>
    </section>
  )
}
