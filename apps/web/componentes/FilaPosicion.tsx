'use client'

import { camposFaltantes, ETIQUETA_CAMPO } from '@sabbi/core'
import type { ClaseModelo, Cta, DestinoVenta } from '@sabbi/core'

import type { ProductoOfrecible } from '../lib/catalogo'
import type { PosicionEditada } from '../lib/estado'
import { paraInput, porcentajeEditable, usd } from '../lib/formato'
import { CampoNumero } from './CampoNumero'
import { DestinosVenta } from './DestinosVenta'
import { DetallePosicion } from './DetallePosicion'
import estilos from './TablaPosiciones.module.css'

interface Props {
  readonly posicion: PosicionEditada
  /** El menú del catálogo, para los destinos de una venta condicionada. */
  readonly productos: readonly ProductoOfrecible[]
  readonly abierta: boolean
  readonly alternar: () => void
  readonly editar: (cambios: Partial<PosicionEditada>) => void
  readonly marcar: (cta: Cta) => void
}

const CLASES: readonly { readonly valor: ClaseModelo; readonly texto: string }[] = [
  { valor: 'fijo', texto: 'Fijo' },
  { valor: 'variable', texto: 'Variable' },
  { valor: 'privados', texto: 'Privados' },
  { valor: 'club', texto: 'Club Deals' },
  { valor: 'otros', texto: 'Otros (Oro/BTC)' },
  { valor: 'inm', texto: 'Inmuebles' },
  { valor: 'cash', texto: 'Cash' },
]

const CTAS: readonly { readonly valor: Cta; readonly texto: string }[] = [
  { valor: 'sin_marcar', texto: 'Sin marcar' },
  { valor: 'conservar', texto: 'Conservar' },
  { valor: 'venta_total', texto: 'Vender' },
  { valor: 'venta_parcial', texto: 'Vender parte' },
  { valor: 'venta_condicionada', texto: 'Venta condicionada' },
]

/** Lo que va bajo el nombre: de dónde salió la fila, en las palabras de la ficha. */
function pieDeFila(posicion: PosicionEditada): string | null {
  const partes = [
    posicion.tipoFicha,
    posicion.uso,
    posicion.pctPertenencia < 1
      ? `${Number((posicion.pctPertenencia * 100).toFixed(2))}% propio`
      : null,
  ].filter((parte): parte is string => parte !== null && parte !== '')

  return partes.length > 0 ? partes.join(' · ') : null
}

/**
 * Una posición de la ficha.
 *
 * La fila lleva lo que se corrige a cada rato; el resto vive en el detalle,
 * que se abre por fila. Cada campo que tocó una persona queda con un punto
 * verde: en una ficha de dieciséis líneas es la única forma de saber, tres
 * días después, qué leyó el parser y qué arregló alguien a mano.
 */
export function FilaPosicion({
  posicion,
  productos,
  abierta,
  alternar,
  editar,
  marcar,
}: Props) {
  const editado = (campo: string): string =>
    posicion.camposEditados.includes(campo) ? (estilos.editado ?? '') : ''

  const parcialExcedido =
    posicion.cta === 'venta_parcial' && posicion.montoVentaParcial > posicion.valorUsd
  const pie = pieDeFila(posicion)
  // La regla de producto: ningún dato vacío pasa en silencio. La misma lista
  // que bloquea la propuesta marca acá la fila, para arreglarlo donde se ve.
  const faltan = camposFaltantes(posicion)
  const claseChip =
    posicion.claseModelo === null
      ? estilos.chipFaltante
      : (estilos[`clase_${posicion.claseModelo}`] ?? '')

  return (
    <>
      <tr className={`${estilos.fila} ${posicion.esInvertible ? '' : estilos.fueraDeCalculo}`}>
        <td className={`${estilos.indice} mono`}>{posicion.orden}</td>

        <td className={estilos.celdaNombre}>
          <span className={`${estilos.nombreLinea} ${editado('institucionProducto')}`}>
            <input
              className={estilos.texto}
              value={posicion.institucionProducto}
              aria-label="Institución o producto"
              onChange={(e) => editar({ institucionProducto: e.target.value })}
            />
          </span>
          <span className={estilos.pie}>
            {pie !== null && <span className={estilos.pieTexto}>{pie}</span>}
            {!posicion.esInvertible && <span className={estilos.marca}>fuera del cálculo</span>}
            {posicion.requiereConfirmacion && (
              <span className={estilos.marcaAtencion} title="Clasificación inferida o sin resolver">
                confirmar clase
              </span>
            )}
            {faltan.length > 0 && (
              <span
                className={estilos.marcaAtencion}
                title="La propuesta no se genera hasta completar estos campos"
              >
                falta {faltan.map((campo) => ETIQUETA_CAMPO[campo] ?? campo).join(', ')}
              </span>
            )}
            {parcialExcedido && (
              <span className={estilos.marcaAlerta}>
                el monto a vender supera {usd(posicion.valorUsd)}
              </span>
            )}
          </span>
        </td>

        <td className={editado('claseModelo')}>
          <select
            className={`${estilos.chip} ${claseChip}`}
            value={posicion.claseModelo ?? ''}
            aria-label="Clase del motor"
            onChange={(e) =>
              editar({ claseModelo: e.target.value === '' ? null : (e.target.value as ClaseModelo) })
            }
          >
            <option value="">sin clase</option>
            {CLASES.map((clase) => (
              <option key={clase.valor} value={clase.valor}>
                {clase.texto}
              </option>
            ))}
          </select>
        </td>

        <td className={`${estilos.derecha} ${editado('valorUsd')}`}>
          <CampoNumero
            className={`${estilos.numero} mono`}
            // La ficha convierte a dólares con una división y deja quince
            // decimales. Se muestran dos, y el estado conserva el valor entero:
            // esos decimales son la diferencia entre cuadrar y no cuadrar. En
            // cuanto el asesor lo corrige, manda lo que él escribió.
            texto={
              posicion.camposEditados.includes('valorUsd')
                ? paraInput(posicion.valorUsd)
                : posicion.valorUsd.toFixed(2)
            }
            aria-label="Valor en dólares"
            alCambiar={(valor) => editar({ valorUsd: valor ?? 0 })}
          />
        </td>

        <td className={`${estilos.derecha} ${editado('rendimientoEst')}`}>
          <span className={estilos.conSufijo}>
            <CampoNumero
              className={`${estilos.numeroCorto} mono`}
              placeholder="—"
              texto={porcentajeEditable(
                posicion.rendimientoEst,
                posicion.camposEditados.includes('rendimientoEst'),
              )}
              aria-label="Rendimiento anual estimado, en porcentaje"
              alCambiar={(valor) =>
                editar({ rendimientoEst: valor === null ? null : valor / 100 })
              }
            />
            {posicion.rendimientoEst !== null && <span className={estilos.sufijo}>%</span>}
          </span>
        </td>

        <td className={editado('cta')}>
          {posicion.esInvertible ? (
            <span className={estilos.decision}>
              <span
                className={`${estilos.barra} ${estilos[`cta_${posicion.cta}`] ?? ''}`}
                aria-hidden="true"
              />
              <select
                className={`${estilos.selectCta} ${estilos[`texto_${posicion.cta}`] ?? ''}`}
                value={posicion.cta}
                aria-label="Decisión"
                onChange={(e) => marcar(e.target.value as Cta)}
              >
                {CTAS.map((cta) => (
                  <option key={cta.valor} value={cta.valor}>
                    {cta.texto}
                  </option>
                ))}
              </select>
            </span>
          ) : (
            <span className={estilos.tenue}>no aplica</span>
          )}

          {posicion.cta === 'venta_parcial' && (
            <CampoNumero
              className={`${estilos.numeroParcial} mono ${parcialExcedido ? estilos.invalido : ''}`}
              texto={paraInput(posicion.montoVentaParcial)}
              aria-label="Monto a vender"
              aria-invalid={parcialExcedido}
              alCambiar={(valor) => editar({ montoVentaParcial: valor ?? 0 })}
            />
          )}
        </td>

        <td>
          <button
            type="button"
            className={estilos.chevron}
            aria-expanded={abierta}
            aria-label={abierta ? 'Cerrar el detalle' : 'Abrir el detalle'}
            onClick={alternar}
          >
            <svg
              width="11"
              height="11"
              viewBox="0 0 12 12"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.6"
              strokeLinecap="round"
              strokeLinejoin="round"
              className={abierta ? estilos.giro : undefined}
            >
              <path d="M2.5 4.5L6 8l3.5-3.5" />
            </svg>
          </button>
        </td>
      </tr>

      {/*
        El reparto cuelga de la fila y no del detalle plegado: elegir «venta
        condicionada» y que no aparezca nada seria pedirle al asesor que adivine
        donde se completa la decision que acaba de tomar.
      */}
      {posicion.cta === 'venta_condicionada' && posicion.esInvertible && (
        <tr>
          <td colSpan={7} className={estilos.celdaDetalle}>
            <DestinosVenta
              destinos={posicion.destinos ?? []}
              valorUsd={posicion.valorUsd}
              productos={productos}
              cambiar={(destinos: readonly DestinoVenta[]) => editar({ destinos })}
            />
          </td>
        </tr>
      )}

      {abierta && (
        <tr>
          <td colSpan={7} className={estilos.celdaDetalle}>
            <DetallePosicion posicion={posicion} editar={editar} />
          </td>
        </tr>
      )}
    </>
  )
}
