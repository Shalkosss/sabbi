'use client'

import type { PosicionEditada } from '../lib/estado'
import { porcentajeEditable, usd } from '../lib/formato'
import { CampoNumero } from './CampoNumero'
import estilos from './DetallePosicion.module.css'

interface Props {
  readonly posicion: PosicionEditada
  readonly editar: (cambios: Partial<PosicionEditada>) => void
}

/**
 * El detalle de una posición.
 *
 * Lo que la ficha trajo y casi nunca hay que tocar: el tipo, el asset class,
 * la moneda, la plaza, la comisión. Sigue siendo editable — las fichas llegan
 * con errores en cualquier campo — pero deja de competir por atención con la
 * decisión de conservar o vender, que es lo único que se hace dieciséis veces
 * seguidas.
 */
export function DetallePosicion({ posicion, editar }: Props) {
  const editado = (campo: string): string =>
    posicion.camposEditados.includes(campo) ? (estilos.editado ?? '') : ''

  return (
    <div className={estilos.detalle}>
      <div className={estilos.grilla}>
        <div className={estilos.campo}>
          <span className={estilos.etiqueta}>Fila en la hoja</span>
          <span className={estilos.fijo}>
            {posicion.fila} · {posicion.origen === 'inmueble' ? 'inmuebles' : 'financiero'}
          </span>
        </div>

        <label className={`${estilos.campo} ${editado('tipoFicha')}`}>
          <span className={estilos.etiqueta}>Tipo en la ficha</span>
          <input
            className={estilos.entrada}
            value={posicion.tipoFicha ?? ''}
            placeholder="sin tipo"
            onChange={(e) => editar({ tipoFicha: e.target.value === '' ? null : e.target.value })}
          />
        </label>

        <label className={`${estilos.campo} ${editado('assetClass')}`}>
          <span className={estilos.etiqueta}>Asset class</span>
          <input
            className={estilos.entrada}
            value={posicion.assetClass ?? ''}
            placeholder="sin clasificar"
            onChange={(e) => editar({ assetClass: e.target.value === '' ? null : e.target.value })}
          />
        </label>

        <label className={`${estilos.campo} ${editado('moneda')}`}>
          <span className={estilos.etiqueta}>Moneda</span>
          <select
            className={estilos.entrada}
            value={posicion.moneda}
            onChange={(e) => editar({ moneda: e.target.value as PosicionEditada['moneda'] })}
          >
            <option value="USD">USD</option>
            <option value="PEN">PEN</option>
          </select>
        </label>

        <label className={`${estilos.campo} ${editado('plaza')}`}>
          <span className={estilos.etiqueta}>Plaza</span>
          <select
            className={estilos.entrada}
            value={posicion.plaza}
            onChange={(e) => editar({ plaza: e.target.value as PosicionEditada['plaza'] })}
          >
            <option value="Perú">Perú</option>
            <option value="Offshore">Offshore</option>
          </select>
        </label>

        <label className={`${estilos.campo} ${editado('feePct')}`}>
          <span className={estilos.etiqueta}>Comisión anual</span>
          <span className={estilos.conSufijo}>
            <CampoNumero
              className={`${estilos.entrada} mono`}
              placeholder="sin dato"
              aria-label="Comisión anual, en porcentaje"
              texto={porcentajeEditable(
                posicion.feePct,
                posicion.camposEditados.includes('feePct'),
              )}
              alCambiar={(valor) => editar({ feePct: valor === null ? null : valor / 100 })}
            />
            {posicion.feePct !== null && <span className={estilos.sufijo}>%</span>}
          </span>
          <span className={estilos.aclaracion}>
            se guarda también en el catálogo, para este producto
          </span>
        </label>

        <div className={estilos.campo}>
          <span className={estilos.etiqueta}>Valor declarado</span>
          <span className={`${estilos.fijo} mono`}>
            {usd(posicion.valorDeclaradoUsd)}
            {posicion.pctPertenencia < 1 && (
              <span className={estilos.aclaracion}>
                entra {Number((posicion.pctPertenencia * 100).toFixed(2))}%
              </span>
            )}
          </span>
        </div>

        {posicion.alquilerMensualUsd !== null && (
          <div className={estilos.campo}>
            <span className={estilos.etiqueta}>Alquiler mensual</span>
            <span className={`${estilos.fijo} mono`}>{usd(posicion.alquilerMensualUsd)}</span>
          </div>
        )}
      </div>

      <label className={`${estilos.fuera} ${editado('esInvertible')}`}>
        <input
          type="checkbox"
          checked={!posicion.esInvertible}
          onChange={(e) => editar({ esInvertible: !e.target.checked })}
        />
        <span>
          <b>Fuera del cálculo</b>
          <span className={estilos.aclaracion}>
            {posicion.esInvertible
              ? 'la saca del patrimonio invertible: no se reparte ni cuenta en el denominador de los pesos'
              : `${usd(posicion.valorUsd)} que no entran al patrimonio invertible ni al denominador de los pesos`}
          </span>
        </span>
      </label>

      <label className={`${estilos.campo} ${estilos.ancho} ${editado('nota')}`}>
        <span className={estilos.etiqueta}>Nota para la propuesta</span>
        <input
          className={estilos.entrada}
          value={posicion.nota}
          placeholder="lo que el asesor quiere que salga escrito en la propuesta"
          onChange={(e) => editar({ nota: e.target.value })}
        />
      </label>
    </div>
  )
}
