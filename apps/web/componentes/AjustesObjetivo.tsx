'use client'

import { CLASES, NOMBRE_CLASE } from '@sabbi/core'
import type { AjusteClase, ClaseModelo, Restriccion } from '@sabbi/core'
import { useId, useState } from 'react'

import type { ProductoOfrecible } from '../lib/catalogo'
import { NOMBRE_CLASE_CORTO, ORDEN_CLASES } from '../lib/clases'
import { paraInput, usdCorto } from '../lib/formato'
import { CampoNumero } from './CampoNumero'
import estilos from './AjustesObjetivo.module.css'

interface Props {
  readonly agregados: readonly Restriccion[]
  readonly ajustes: readonly AjusteClase[]
  readonly productos: readonly ProductoOfrecible[]
  readonly patrimonioUsd: number
  readonly cambiarActivo: (activo: Restriccion) => void
  readonly quitarActivo: (id: string) => void
  readonly cambiarAjuste: (clase: ClaseModelo, ajuste: AjusteClase | null) => void
}

/** Lo que se puede pedir para una clase. `modelo` es no pedir nada. */
type Modo = 'modelo' | 'fijar' | 'excluir'

const CLASE_POR_DEFECTO: ClaseModelo = 'variable'

/**
 * Lo que el asesor le hace al portafolio objetivo.
 *
 * La ficha dice qué tiene el cliente; esto dice qué quiere el asesor que el
 * objetivo diga, y son dos conversaciones distintas. Vive plegado por la misma
 * razón que los parámetros: la mayoría de las propuestas no lleva ni un
 * ajuste, y las que llevan uno no lo pueden esconder.
 *
 * Dos palancas y ninguna más. Un activo agregado suma una línea al objetivo y
 * clava esa parte del ticket. Un ajuste manda sobre la clase entera: la fija en
 * un monto o la saca, y el motor prorratea el resto entre las que quedan.
 * Ninguna de las dos inventa dinero.
 */
export function AjustesObjetivo({
  agregados,
  ajustes,
  productos,
  patrimonioUsd,
  cambiarActivo,
  quitarActivo,
  cambiarAjuste,
}: Props) {
  const [abierto, setAbierto] = useState(false)
  const panelId = useId()
  const listaId = useId()

  const ajusteDe = (clase: ClaseModelo) => ajustes.find((a) => a.clase === clase) ?? null
  const claseDeProducto = new Map(productos.map((p) => [p.nombre, p.clase]))

  const agregar = () => {
    cambiarActivo({
      id: crypto.randomUUID(),
      nombre: '',
      montoUsd: 0,
      clase: CLASE_POR_DEFECTO,
      productoId: null,
    })
  }

  // Elegir del menú trae la clase puesta: es el dato que el catálogo ya sabe y
  // que nadie debería tener que volver a decidir.
  const renombrar = (activo: Restriccion, nombre: string) => {
    const delCatalogo = claseDeProducto.get(nombre) ?? null
    cambiarActivo({ ...activo, nombre, clase: delCatalogo ?? activo.clase })
  }

  const cambiarModo = (clase: ClaseModelo, modo: Modo) => {
    if (modo === 'modelo') return cambiarAjuste(clase, null)
    if (modo === 'excluir') return cambiarAjuste(clase, { clase, modo: 'excluir', montoUsd: 0 })
    return cambiarAjuste(clase, {
      clase,
      modo: 'fijar',
      montoUsd: ajusteDe(clase)?.montoUsd ?? 0,
    })
  }

  const resumen = [
    ...(agregados.length > 0
      ? [agregados.length === 1 ? '1 activo agregado' : `${agregados.length} activos agregados`]
      : []),
    ...ajustes.map((a) =>
      a.modo === 'excluir'
        ? `${NOMBRE_CLASE_CORTO[a.clase]} fuera`
        : `${NOMBRE_CLASE_CORTO[a.clase]} en ${usdCorto(a.montoUsd)}`,
    ),
  ]

  return (
    <section className={estilos.bloque} aria-label="Ajustes del portafolio objetivo">
      <div className={estilos.barra}>
        <p className={estilos.titulo}>Portafolio objetivo</p>

        <div className={estilos.valores}>
          {resumen.length === 0 ? (
            <span className={estilos.limpio}>sin ajustes — sale entero del modelo</span>
          ) : (
            resumen.map((texto) => (
              <span key={texto} className={estilos.chip}>
                {texto}
              </span>
            ))
          )}
        </div>

        <button
          type="button"
          className={estilos.ajustar}
          aria-expanded={abierto}
          aria-controls={panelId}
          onClick={() => setAbierto((previo) => !previo)}
        >
          {abierto ? 'Cerrar' : 'Ajustar'}
          <svg
            width="11"
            height="11"
            viewBox="0 0 12 12"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.6"
            strokeLinecap="round"
            strokeLinejoin="round"
            aria-hidden="true"
            className={abierto ? estilos.giro : undefined}
          >
            <path d="M2.5 4.5L6 8l3.5-3.5" />
          </svg>
        </button>
      </div>

      <div id={panelId} hidden={!abierto} className={estilos.panel}>
        <datalist id={listaId}>
          {productos.map((producto) => (
            <option key={producto.nombre} value={producto.nombre} />
          ))}
        </datalist>

        <div className={estilos.seccion}>
          <h3 className={estilos.subtitulo}>Activos agregados</h3>
          <p className={estilos.ayuda}>
            Una línea que el modelo no propone y el asesor quiere igual. Clava ese monto dentro
            del ticket: no agranda el patrimonio, sale del mismo dinero. Elegir del catálogo hace
            que la línea salga con su retorno.
          </p>

          {agregados.length > 0 && (
            <table className={estilos.tabla}>
              <thead>
                <tr>
                  <th scope="col">Activo</th>
                  <th scope="col">Clase</th>
                  <th scope="col" className={estilos.derecha}>
                    Monto
                  </th>
                  <th scope="col" aria-label="Quitar" />
                </tr>
              </thead>
              <tbody>
                {agregados.map((activo) => (
                  <tr key={activo.id}>
                    <td>
                      <input
                        className={estilos.texto}
                        list={listaId}
                        value={activo.nombre}
                        placeholder="Nombre del producto"
                        aria-label="Nombre del activo"
                        onChange={(e) => renombrar(activo, e.target.value)}
                      />
                    </td>
                    <td>
                      <select
                        className={`${estilos.chipClase} ${estilos[`clase_${activo.clase}`] ?? ''}`}
                        value={activo.clase}
                        aria-label="Clase del activo"
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
                      <CampoNumero
                        className={`${estilos.numero} mono`}
                        texto={paraInput(activo.montoUsd)}
                        aria-label="Monto del activo, en dólares"
                        alCambiar={(valor) => cambiarActivo({ ...activo, montoUsd: valor ?? 0 })}
                      />
                    </td>
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
            </table>
          )}

          <button type="button" className={estilos.agregar} onClick={agregar}>
            + Agregar activo
          </button>
        </div>

        <div className={estilos.seccion}>
          <h3 className={estilos.subtitulo}>Montos por clase</h3>
          <p className={estilos.ayuda}>
            Fijar clava el objetivo de una clase y el motor prorratea el resto entre las demás:
            Inmobiliario Directo en {usdCorto(60_000)} cuando el modelo le daba {usdCorto(70_000)}
            , y esos {usdCorto(10_000)} se reparten. Ninguna clase baja de lo que el cliente ya
            conserva ahí — para eso hay que marcar la venta en la ficha.
          </p>

          <div className={estilos.clases}>
            {ORDEN_CLASES.map((clase) => {
              const ajuste = ajusteDe(clase)
              const modo: Modo = ajuste === null ? 'modelo' : ajuste.modo

              return (
                <div key={clase} className={estilos.filaClase}>
                  <span className={estilos.nombreClase} title={NOMBRE_CLASE[clase]}>
                    {NOMBRE_CLASE_CORTO[clase]}
                  </span>

                  <select
                    className={estilos.modo}
                    value={modo}
                    aria-label={`Qué hacer con ${NOMBRE_CLASE[clase]}`}
                    onChange={(e) => cambiarModo(clase, e.target.value as Modo)}
                  >
                    <option value="modelo">Según el modelo</option>
                    <option value="fijar">Fijar en</option>
                    <option value="excluir">Fuera del cálculo</option>
                  </select>

                  {modo === 'fijar' ? (
                    <CampoNumero
                      className={`${estilos.numero} mono`}
                      texto={paraInput(ajuste?.montoUsd ?? 0)}
                      aria-label={`Monto fijado para ${NOMBRE_CLASE[clase]}, en dólares`}
                      alCambiar={(valor) =>
                        cambiarAjuste(clase, { clase, modo: 'fijar', montoUsd: valor ?? 0 })
                      }
                    />
                  ) : (
                    <span className={estilos.sinMonto}>
                      {modo === 'excluir' ? usdCorto(0) : '—'}
                    </span>
                  )}
                </div>
              )
            })}
          </div>

          <p className={estilos.pie}>
            Patrimonio invertible <b className="mono">{usdCorto(patrimonioUsd)}</b> — es el techo
            de todo lo que fijes.
          </p>
        </div>
      </div>
    </section>
  )
}
