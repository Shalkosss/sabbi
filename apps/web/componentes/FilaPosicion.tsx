'use client'

import type { ClaseModelo, Cta } from '@sabbi/core'

import { desdeInput, paraInput, usd } from '../lib/formato'
import type { PosicionEditada } from '../lib/estado'
import estilos from './TablaPosiciones.module.css'

interface Props {
  readonly posicion: PosicionEditada
  readonly editar: (cambios: Partial<PosicionEditada>) => void
  readonly marcar: (cta: Cta) => void
}

const CLASES: readonly { readonly valor: ClaseModelo; readonly texto: string }[] = [
  { valor: 'fijo', texto: 'Fijo' },
  { valor: 'variable', texto: 'Variable' },
  { valor: 'privados', texto: 'Privados' },
  { valor: 'inm', texto: 'Inmobiliario' },
  { valor: 'cash', texto: 'Cash' },
]

const CTAS: readonly { readonly valor: Cta; readonly texto: string }[] = [
  { valor: 'sin_marcar', texto: 'Sin marcar' },
  { valor: 'conservar', texto: 'Conservar' },
  { valor: 'venta_total', texto: 'Venta total' },
  { valor: 'venta_parcial', texto: 'Venta parcial' },
]

/**
 * Fracción a porcentaje editable.
 *
 * Un cap rate calculado sale con quince decimales; en pantalla van dos. Lo que
 * el asesor teclea se respeta tal cual, sin recortarle nada.
 */
const porcentaje = (fraccion: number | null, editado: boolean): string => {
  if (fraccion === null) return ''
  const escala = fraccion * 100
  return editado ? String(escala) : String(Number(escala.toFixed(2)))
}

export function FilaPosicion({ posicion, editar, marcar }: Props) {
  const editado = (campo: string) => (posicion.camposEditados.includes(campo) ? estilos.editado : '')
  const parcialExcedido =
    posicion.cta === 'venta_parcial' && posicion.montoVentaParcial > posicion.valorUsd

  return (
    <tr className={posicion.esInvertible ? '' : estilos.fueraDeCalculo}>
      <td className={estilos.indice}>{posicion.orden}</td>

      <td className={editado('institucionProducto')}>
        <input
          className={estilos.texto}
          value={posicion.institucionProducto}
          aria-label="Institución o producto"
          onChange={(e) => editar({ institucionProducto: e.target.value })}
        />
        <div className={estilos.marcas}>
          {!posicion.esInvertible && <span className={estilos.marcaTenue}>uso propio</span>}
          {posicion.requiereConfirmacion && (
            <span className={estilos.marcaAtencion} title="Clasificación inferida o sin resolver">
              confirmar clase
            </span>
          )}
        </div>
      </td>

      <td className={estilos.celdaTenue}>{posicion.tipoFicha ?? '—'}</td>

      <td className={editado('assetClass')}>
        <input
          className={estilos.texto}
          value={posicion.assetClass ?? ''}
          placeholder="sin clasificar"
          aria-label="Asset class"
          onChange={(e) => editar({ assetClass: e.target.value === '' ? null : e.target.value })}
        />
      </td>

      <td className={editado('claseModelo')}>
        <select
          className={`${estilos.control} ${posicion.claseModelo === null ? estilos.faltante : ''}`}
          value={posicion.claseModelo ?? ''}
          aria-label="Clase del motor"
          onChange={(e) =>
            editar({ claseModelo: e.target.value === '' ? null : (e.target.value as ClaseModelo) })
          }
        >
          <option value="">— elegí —</option>
          {CLASES.map((clase) => (
            <option key={clase.valor} value={clase.valor}>
              {clase.texto}
            </option>
          ))}
        </select>
      </td>

      <td className={editado('moneda')}>
        <select
          className={estilos.control}
          value={posicion.moneda}
          aria-label="Moneda"
          onChange={(e) => editar({ moneda: e.target.value as PosicionEditada['moneda'] })}
        >
          <option value="USD">USD</option>
          <option value="PEN">PEN</option>
        </select>
      </td>

      <td className={editado('plaza')}>
        <select
          className={estilos.control}
          value={posicion.plaza}
          aria-label="Plaza"
          onChange={(e) => editar({ plaza: e.target.value as PosicionEditada['plaza'] })}
        >
          <option value="Perú">Perú</option>
          <option value="Offshore">Offshore</option>
        </select>
      </td>

      <td className={`${estilos.numerica} ${editado('valorUsd')}`}>
        <input
          className={`${estilos.numero} mono`}
          inputMode="decimal"
          // La ficha convierte a dólares con una división y deja quince
          // decimales. Se muestran dos, y el estado conserva el valor entero:
          // esos decimales son la diferencia entre cuadrar y no cuadrar. En
          // cuanto el asesor lo corrige, manda lo que él escribió.
          value={
            posicion.camposEditados.includes('valorUsd')
              ? paraInput(posicion.valorUsd)
              : posicion.valorUsd.toFixed(2)
          }
          aria-label="Valor en dólares"
          onChange={(e) => editar({ valorUsd: desdeInput(e.target.value) ?? 0 })}
        />
      </td>

      <td className={`${estilos.numerica} ${editado('rendimientoEst')}`}>
        <input
          className={`${estilos.numeroCorto} mono`}
          inputMode="decimal"
          placeholder="—"
          value={porcentaje(posicion.rendimientoEst, posicion.camposEditados.includes('rendimientoEst'))}
          aria-label="Rendimiento anual estimado, en porcentaje"
          onChange={(e) => {
            const leido = desdeInput(e.target.value)
            editar({ rendimientoEst: leido === null ? null : leido / 100 })
          }}
        />
        <span className={estilos.sufijo}>%</span>
      </td>

      <td className={`${estilos.numerica} ${editado('feePct')}`}>
        <input
          className={`${estilos.numeroCorto} mono`}
          inputMode="decimal"
          placeholder="—"
          value={porcentaje(posicion.feePct, posicion.camposEditados.includes('feePct'))}
          aria-label="Fee anual, en porcentaje"
          onChange={(e) => {
            const leido = desdeInput(e.target.value)
            editar({ feePct: leido === null ? null : leido / 100 })
          }}
        />
        <span className={estilos.sufijo}>%</span>
      </td>

      <td className={editado('cta')}>
        {posicion.esInvertible ? (
          <select
            className={`${estilos.control} ${estilos[`cta_${posicion.cta}`] ?? ''}`}
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
        ) : (
          <span className={estilos.celdaTenue}>no aplica</span>
        )}
      </td>

      <td className={`${estilos.numerica} ${editado('montoVentaParcial')}`}>
        {posicion.cta === 'venta_parcial' ? (
          <input
            className={`${estilos.numero} mono ${parcialExcedido ? estilos.invalido : ''}`}
            inputMode="decimal"
            value={paraInput(posicion.montoVentaParcial)}
            aria-label="Monto a vender"
            aria-invalid={parcialExcedido}
            title={parcialExcedido ? `No puede superar ${usd(posicion.valorUsd)}` : undefined}
            onChange={(e) => editar({ montoVentaParcial: desdeInput(e.target.value) ?? 0 })}
          />
        ) : (
          <span className={estilos.celdaTenue}>—</span>
        )}
      </td>

      <td className={editado('nota')}>
        <input
          className={estilos.texto}
          value={posicion.nota}
          placeholder="nota para la propuesta"
          aria-label="Nota"
          onChange={(e) => editar({ nota: e.target.value })}
        />
      </td>
    </tr>
  )
}
