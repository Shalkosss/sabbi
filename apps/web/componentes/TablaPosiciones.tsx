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
  /** Quitar una posición de la vista y del cálculo, o restaurarla. */
  readonly ocultar: (id: string, oculta: boolean) => void
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

/**
 * Las decisiones que se pueden tomar en lote.
 *
 * Vender parte y venta condicionada quedan fuera a propósito: las dos piden un
 * dato por fila —el monto, el reparto— y aplicarlas a doce posiciones dejaría
 * doce decisiones a medio llenar que después hay que abrir una por una. Se
 * marcan donde se completan.
 */
const CTAS_EN_LOTE: readonly { readonly valor: Cta; readonly texto: string }[] = [
  { valor: 'conservar', texto: 'Conservar' },
  { valor: 'venta_total', texto: 'Vender' },
  { valor: 'sin_marcar', texto: 'Sin marcar' },
]

const COLUMNAS = [
  { texto: '', clase: estilos.colSel, alinea: undefined },
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
  ocultar,
  agregados,
  cambiarActivo,
  quitarActivo,
}: Props) {
  const [abierta, setAbierta] = useState<string | null>(null)
  const [elegidas, setElegidas] = useState<ReadonlySet<string>>(new Set())
  const listaId = useId()

  // Las ocultas no se dibujan ni cuentan: se quitaron de la vista. Siguen en
  // `posiciones` —y en la base— para poder restaurarlas desde la barra de abajo.
  const visibles = posiciones.filter((posicion) => !posicion.oculta)
  const ocultas = posiciones.filter((posicion) => posicion.oculta)
  const claseDeProducto = new Map(productos.map((producto) => [producto.nombre, producto.clase]))

  // Elegir del menú trae la clase puesta: es el dato que el catálogo ya sabe y
  // que nadie debería tener que volver a decidir.
  const renombrar = (activo: ActivoAgregado, nombre: string) => {
    const delCatalogo = claseDeProducto.get(nombre) ?? null
    cambiarActivo({ ...activo, nombre, clase: delCatalogo ?? activo.clase })
  }

  // La selección vive en la tabla y no en el estado de la revisión: no se
  // guarda, no viaja a la base y se pierde al recargar, que es exactamente lo
  // que uno espera de haber marcado unas filas para hacerles algo.
  const elegir = (id: string, elegida: boolean) =>
    setElegidas((previas) => {
      const siguiente = new Set(previas)
      if (elegida) siguiente.add(id)
      else siguiente.delete(id)
      return siguiente
    })

  const todas = elegidas.size > 0 && elegidas.size === visibles.length
  const alternarTodas = () =>
    setElegidas(todas ? new Set() : new Set(visibles.map((posicion) => posicion.id)))

  const enLote = visibles.filter((posicion) => elegidas.has(posicion.id))

  const asignarClase = (clase: ClaseModelo) => {
    for (const posicion of enLote) editar(posicion.id, { claseModelo: clase })
  }

  // Una posición fuera del cálculo no tiene decisión —la fila dice «no
  // aplica»—, así que el lote la saltea en vez de escribirle una que la
  // pantalla no muestra.
  const asignarCta = (cta: Cta) => {
    for (const posicion of enLote) {
      if (posicion.esInvertible) marcar(posicion.id, cta)
    }
  }

  const sinClase = enLote.filter((posicion) => posicion.claseModelo === null).length
  const fueraDelCalculo = enLote.filter((posicion) => !posicion.esInvertible).length

  const financieras = visibles.filter((posicion) => posicion.origen === 'financiero').length
  const inmuebles = visibles.length - financieras
  const total = visibles
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

      {elegidas.size > 0 && (
        <div className={estilos.lote} role="group" aria-label="Acciones sobre las filas elegidas">
          <span className={estilos.loteConteo}>
            {plural(elegidas.size, 'fila elegida', 'filas elegidas')}
            {sinClase > 0 && <span className={estilos.loteNota}> · {sinClase} sin clase</span>}
          </span>

          <select
            className={estilos.loteSelector}
            value=""
            aria-label="Asignar una clase a todas las filas elegidas"
            onChange={(e) => {
              if (e.target.value !== '') asignarClase(e.target.value as ClaseModelo)
            }}
          >
            <option value="">Asignar clase…</option>
            {CLASES.map((clase) => (
              <option key={clase} value={clase}>
                {NOMBRE_CLASE_CORTO[clase]}
              </option>
            ))}
          </select>

          <select
            className={estilos.loteSelector}
            value=""
            aria-label="Marcar una decisión en todas las filas elegidas"
            onChange={(e) => {
              if (e.target.value !== '') asignarCta(e.target.value as Cta)
            }}
          >
            <option value="">Marcar decisión…</option>
            {CTAS_EN_LOTE.map((cta) => (
              <option key={cta.valor} value={cta.valor}>
                {cta.texto}
              </option>
            ))}
          </select>

          <button
            type="button"
            className={estilos.loteLimpiar}
            onClick={() => setElegidas(new Set())}
          >
            soltar la selección
          </button>

          {fueraDelCalculo > 0 && (
            <span className={estilos.loteNota}>
              {plural(fueraDelCalculo, 'fila elegida está', 'filas elegidas están')} fuera del
              cálculo: la clase sí les entra, la decisión no.
            </span>
          )}
        </div>
      )}

      <div className={estilos.envoltorio}>
        <table className={estilos.tabla}>
          <colgroup>
            {COLUMNAS.map((columna, i) => (
              <col key={i} className={columna.clase} />
            ))}
          </colgroup>
          <thead>
            <tr>
              <th scope="col" className={estilos.celdaSel}>
                <input
                  type="checkbox"
                  checked={todas}
                  aria-label={todas ? 'Soltar todas las filas' : 'Elegir todas las filas'}
                  onChange={alternarTodas}
                />
              </th>
              {COLUMNAS.slice(1).map((columna, i) => (
                <th key={i} scope="col" className={columna.alinea}>
                  {columna.texto}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {visibles.map((posicion) => (
              <FilaPosicion
                key={posicion.id}
                posicion={posicion}
                productos={productos}
                abierta={abierta === posicion.id}
                alternar={() => setAbierta((previa) => (previa === posicion.id ? null : posicion.id))}
                seleccionada={elegidas.has(posicion.id)}
                alSeleccionar={(elegida) => elegir(posicion.id, elegida)}
                editar={(cambios) => editar(posicion.id, cambios)}
                marcar={(cta) => marcar(posicion.id, cta)}
                ocultar={() => ocultar(posicion.id, true)}
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
                  {/* La columna de selección: un activo agregado no es una fila
                      de la ficha y no entra en las acciones en lote. */}
                  <td aria-hidden="true" />
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

      {ocultas.length > 0 && (
        <details className={estilos.ocultas}>
          <summary>
            {plural(ocultas.length, 'posición quitada', 'posiciones quitadas')} de la vista
            <span className={estilos.ocultasNota}>no entran al cálculo — se pueden restaurar</span>
          </summary>
          <ul className={estilos.ocultasLista}>
            {ocultas.map((posicion) => (
              <li key={posicion.id} className={estilos.ocultaItem}>
                <span className={estilos.ocultaNombre}>{posicion.institucionProducto}</span>
                <span className={`${estilos.ocultaMonto} mono`}>{usd(posicion.valorUsd)}</span>
                <button
                  type="button"
                  className={estilos.restaurar}
                  onClick={() => ocultar(posicion.id, false)}
                >
                  Restaurar
                </button>
              </li>
            ))}
          </ul>
        </details>
      )}
    </section>
  )
}
