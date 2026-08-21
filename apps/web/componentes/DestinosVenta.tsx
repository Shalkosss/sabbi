'use client'

import { CLASES, NOMBRE_CLASE } from '@sabbi/core'
import type { ClaseModelo, DestinoVenta } from '@sabbi/core'
import { useId } from 'react'

import type { ProductoOfrecible } from '../lib/catalogo'
import { NOMBRE_CLASE_CORTO } from '../lib/clases'
import { usd } from '../lib/formato'
import { CampoNumero } from './CampoNumero'
import estilos from './DestinosVenta.module.css'

/**
 * A dónde va el dinero de una venta condicionada.
 *
 * El caso es literal y viene de la mesa: el cliente vende su inmueble y ya
 * decidió que la mitad va al Fondo Estratégico. Marcarlo como venta total
 * mandaría esa mitad al pozo común y el benchmark la repartiría entre las
 * siete clases — la instrucción del cliente desaparecería dentro del prorrateo
 * sin que nadie lo note, que es la peor forma de perder una decisión.
 *
 * Se reparte en porcentajes y no en montos porque así es como se decide —«la
 * mitad»— y porque un monto tecleado a mano queda viejo en cuanto alguien
 * corrige la valuación del inmueble. Al lado de cada porcentaje va lo que
 * significa en dólares, que es lo que después hay que reconocer en la
 * propuesta.
 *
 * El reparto tiene que sumar 100%. Mientras no sume, la pantalla lo dice acá y
 * el motor se niega a calcular: un reparto que cierra en 70% deja el 30% sin
 * dueño, y el resultado no sería el que el cliente pidió.
 */

interface Props {
  readonly destinos: readonly DestinoVenta[]
  readonly valorUsd: number
  readonly productos: readonly ProductoOfrecible[]
  readonly cambiar: (destinos: readonly DestinoVenta[]) => void
}

/** Fracción a porcentaje editable, sin arrastrar la basura del punto flotante. */
const aPct = (fraccion: number): string => String(Number((fraccion * 100).toFixed(4)))

export function DestinosVenta({ destinos, valorUsd, productos, cambiar }: Props) {
  const listaId = useId()
  const claseDeProducto = new Map(productos.map((producto) => [producto.nombre, producto.clase]))

  const total = destinos.reduce((acc, destino) => acc + destino.pct, 0)
  const cuadra = Math.abs(total - 1) <= 1e-6
  const faltante = 1 - total

  const conCambio = (id: string, cambio: Partial<DestinoVenta>) =>
    cambiar(destinos.map((destino) => (destino.id === id ? { ...destino, ...cambio } : destino)))

  const agregar = () =>
    cambiar([
      ...destinos,
      {
        id: crypto.randomUUID(),
        // Lo que falta para cerrar, que casi siempre es lo que se quiere poner.
        // Con el reparto ya cuadrado arranca en cero y no en un número raro.
        pct: Math.max(0, Number(faltante.toFixed(6))),
        clase: 'club',
        productoId: null,
        nombre: '',
      },
    ])

  const quitar = (id: string) => cambiar(destinos.filter((destino) => destino.id !== id))

  // Elegir del menú trae la clase puesta: es el dato que el catálogo ya sabe y
  // que nadie debería tener que volver a decidir.
  const renombrar = (destino: DestinoVenta, nombre: string) =>
    conCambio(destino.id, { nombre, clase: claseDeProducto.get(nombre) ?? destino.clase })

  return (
    <div className={estilos.bloque}>
      <datalist id={listaId}>
        {productos.map((producto) => (
          <option key={producto.nombre} value={producto.nombre} />
        ))}
      </datalist>

      <p className={estilos.ayuda}>
        Se vende entero y el dinero <b>no</b> cae al pozo común: cada destino clava su parte donde
        el cliente la pidió. Tiene que sumar 100%.
      </p>

      {destinos.length > 0 && (
        <table className={estilos.tabla}>
          <thead>
            <tr>
              <th scope="col" className={estilos.derecha}>
                %
              </th>
              <th scope="col" className={estilos.derecha}>
                USD
              </th>
              <th scope="col">Destino</th>
              <th scope="col">Clase</th>
              <th scope="col" aria-label="Quitar" />
            </tr>
          </thead>

          <tbody>
            {destinos.map((destino) => (
              <tr key={destino.id}>
                <td className={estilos.derecha}>
                  <CampoNumero
                    className={`${estilos.numero} mono`}
                    texto={aPct(destino.pct)}
                    aria-label="Porcentaje de la venta"
                    alCambiar={(valor) =>
                      conCambio(destino.id, { pct: valor === null ? 0 : valor / 100 })
                    }
                  />
                </td>

                <td className={`${estilos.derecha} ${estilos.equivale} mono`}>
                  {usd(valorUsd * destino.pct)}
                </td>

                <td>
                  <input
                    className={estilos.texto}
                    list={listaId}
                    value={destino.nombre}
                    placeholder="Fondo, clase o instrumento"
                    aria-label="Destino del dinero"
                    onChange={(e) => renombrar(destino, e.target.value)}
                  />
                </td>

                <td>
                  <select
                    className={estilos.clase}
                    value={destino.clase}
                    aria-label="Clase del destino"
                    onChange={(e) =>
                      conCambio(destino.id, { clase: e.target.value as ClaseModelo })
                    }
                  >
                    {CLASES.map((clase) => (
                      <option key={clase} value={clase} title={NOMBRE_CLASE[clase]}>
                        {NOMBRE_CLASE_CORTO[clase]}
                      </option>
                    ))}
                  </select>
                </td>

                <td>
                  <button
                    type="button"
                    className={estilos.quitar}
                    aria-label={`Quitar el destino ${destino.nombre === '' ? 'sin nombre' : destino.nombre}`}
                    onClick={() => quitar(destino.id)}
                  >
                    ×
                  </button>
                </td>
              </tr>
            ))}
          </tbody>

          <tfoot>
            <tr>
              <td className={estilos.derecha}>
                <span className={cuadra ? estilos.cuadra : estilos.noCuadra}>
                  {Number((total * 100).toFixed(2))}%
                </span>
              </td>
              <td className={`${estilos.derecha} mono ${estilos.equivale}`}>
                {usd(valorUsd * total)}
              </td>
              <td colSpan={3}>
                {!cuadra && (
                  <span className={estilos.aviso}>
                    {faltante > 0
                      ? `Falta repartir ${Number((faltante * 100).toFixed(2))}%.`
                      : `Te pasaste por ${Number((-faltante * 100).toFixed(2))}%.`}
                    <button
                      type="button"
                      className={estilos.cuadrar}
                      onClick={() => {
                        const ultimo = destinos[destinos.length - 1]
                        if (ultimo === undefined) return
                        conCambio(ultimo.id, {
                          pct: Math.max(0, Number((ultimo.pct + faltante).toFixed(6))),
                        })
                      }}
                    >
                      cuadrar el último
                    </button>
                  </span>
                )}
              </td>
            </tr>
          </tfoot>
        </table>
      )}

      <button type="button" className={estilos.agregar} onClick={agregar}>
        + Agregar destino
      </button>
    </div>
  )
}
