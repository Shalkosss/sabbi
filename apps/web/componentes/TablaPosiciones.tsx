'use client'

import { CLASES } from '@sabbi/core'
import type { ClaseModelo, Cta } from '@sabbi/core'
import { useId, useState } from 'react'

import type { PosicionEditada } from '../lib/estado'
import { NOMBRE_CLASE_CORTO } from '../lib/clases'
import { plural, usd } from '../lib/formato'
import type { ActivoAgregado, ProductoOfrecible } from '../lib/catalogo'
import { CampoMonto } from './CampoMonto'
import { FilaPosicion } from './FilaPosicion'
import estilos from './TablaPosiciones.module.css'

interface Props {
  readonly posiciones: readonly PosicionEditada[]
  /** El menú del catálogo, para los destinos de una venta condicionada. */
  readonly productos: readonly ProductoOfrecible[]
  readonly editar: (id: string, cambios: Partial<PosicionEditada>) => void
  readonly marcar: (id: string, cta: Cta) => void
  /**
   * Los activos que el asesor sumó al objetivo.
   *
   * No son posiciones de la ficha —el cliente no los tiene— pero se editan
   * acá igual, y por una razón concreta: viven arriba, en el panel de
   * ajustes, y hasta ahora había que subir a buscarlos. Verlos al pie de la
   * lista con la que se trabaja es lo que los vuelve modificables.
   */
  readonly agregados: readonly ActivoAgregado[]
  readonly cambiarActivo: (activo: ActivoAgregado) => void
  readonly quitarActivo: (id: string) => void
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
export function TablaPosiciones({
  posiciones,
  productos,
  editar,
  marcar,
  agregados,
  cambiarActivo,
  quitarActivo,
}: Props) {
  const [abierta, setAbierta] = useState<string | null>(null)
  const listaId = useId()
  const claseDeProducto = new Map(productos.map((producto) => [producto.nombre, producto.clase]))

  // Elegir del menú trae la clase puesta: es el dato que el catálogo ya sabe y
  // que nadie debería tener que volver a decidir.
  const renombrar = (activo: ActivoAgregado, nombre: string) => {
    const delCatalogo = claseDeProducto.get(nombre) ?? null
    cambiarActivo({ ...activo, nombre, clase: delCatalogo ?? activo.clase })
  }

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

          {agregados.length > 0 && (
            <tbody>
              <tr className={estilos.bandaAgregados}>
                <th scope="rowgroup" colSpan={COLUMNAS.length}>
                  Activos agregados al objetivo
                  <span className={estilos.bandaNota}>
                    no están en la ficha: los sumó el asesor y clavan su parte del ticket
                  </span>
                </th>
              </tr>

              {agregados.map((activo) => (
                <tr key={activo.id} className={estilos.filaAgregado}>
                  <td className={estilos.derecha} aria-hidden="true">
                    +
                  </td>
                  <td>
                    <input
                      className={estilos.texto}
                      list={listaId}
                      value={activo.nombre}
                      placeholder="Nombre del producto"
                      aria-label="Nombre del activo agregado"
                      onChange={(e) => renombrar(activo, e.target.value)}
                    />
                  </td>
                  <td>
                    <select
                      className={estilos.selector}
                      value={activo.clase}
                      aria-label={`Clase de ${activo.nombre === '' ? 'el activo agregado' : activo.nombre}`}
                      onChange={(e) =>
                        cambiarActivo({ ...activo, clase: e.target.value as ClaseModelo })
                      }
                    >
                      {CLASES.map((clase) => (
                        <option key={clase} value={clase}>
                          {NOMBRE_CLASE_CORTO[clase]}
                        </option>
                      ))}
                    </select>
                  </td>
                  <td className={estilos.derecha}>
                    <CampoMonto
                      valor={activo.montoUsd}
                      aria-label={`Monto de ${activo.nombre === '' ? 'el activo agregado' : activo.nombre}`}
                      alCambiar={(valor) => cambiarActivo({ ...activo, montoUsd: valor ?? 0 })}
                    />
                  </td>
                  {/*
                    Un activo agregado no tiene rendimiento propio ni decisión:
                    no es algo que el cliente tenga, es una línea del objetivo.
                    Las celdas quedan vacías en vez de inventar un guion que
                    parezca un dato que falta.
                  */}
                  <td />
                  <td className={estilos.tenue}>del objetivo</td>
                  <td>
                    <button
                      type="button"
                      className={estilos.quitar}
                      aria-label={`Quitar ${activo.nombre === '' ? 'el activo sin nombre' : activo.nombre}`}
                      onClick={() => quitarActivo(activo.id)}
                    >
                      ×
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          )}
        </table>

        <datalist id={listaId}>
          {productos.map((producto) => (
            <option key={producto.nombre} value={producto.nombre} />
          ))}
        </datalist>
      </div>
    </section>
  )
}
