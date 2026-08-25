'use client'

import { PERFILES } from '@sabbi/core'
import type { EstadoInstitucional, Perfil } from '@sabbi/core'

import type { Parametros } from '../lib/estado'
import { paraInput, usd } from '../lib/formato'
import { CampoNumero } from './CampoNumero'
import estilos from './PanelParametros.module.css'

interface Props {
  readonly parametros: Parametros
  readonly cambiar: (cambios: Partial<Parametros>) => void
  readonly patrimonioUsd: number
  readonly inmueblesRentaUsd: number
  readonly flujoDeclarado: string | null
}

/** Umbral del segmento, en dólares de patrimonio. */
const CORTE_SEGMENTO = 500_000

/**
 * Parámetros de la propuesta.
 *
 * Arriba lo que se toca siempre; lo avanzado vive plegado. Cada control dice
 * qué efecto tiene antes de que alguien lo mueva.
 */
export function PanelParametros({
  parametros,
  cambiar,
  patrimonioUsd,
  inmueblesRentaUsd,
  flujoDeclarado,
}: Props) {
  const segmento = patrimonioUsd >= CORTE_SEGMENTO ? 'gte500' : 'lt500'

  return (
    <section className={estilos.panel} aria-label="Parámetros de la propuesta">
      <div className={estilos.principales}>
        <label className={estilos.campo}>
          <span className={estilos.etiqueta}>Perfil de riesgo</span>
          <select
            value={parametros.perfil}
            onChange={(e) => cambiar({ perfil: e.target.value as Perfil })}
          >
            {PERFILES.map((perfil) => (
              <option key={perfil} value={perfil}>
                {perfil}
              </option>
            ))}
          </select>
        </label>

        <div className={estilos.campo}>
          <span className={estilos.etiqueta}>Segmento</span>
          <p className={estilos.derivado}>
            {segmento === 'gte500' ? '≥ 500k' : '< 500k'}
            <span className={estilos.ayuda}>por patrimonio, {usd(patrimonioUsd)}</span>
          </p>
        </div>

        <label className={estilos.interruptor}>
          <input
            type="checkbox"
            checked={parametros.necesitaFlujos}
            onChange={(e) => cambiar({ necesitaFlujos: e.target.checked })}
          />
          <span>
            <b>Necesita flujos</b>
            <span className={estilos.ayuda}>
              {flujoDeclarado === null
                ? 'ningún fondo mutuo recibe dinero'
                : `la ficha declara «${flujoDeclarado}»`}
            </span>
          </span>
        </label>

        <label className={estilos.interruptor}>
          <input
            type="checkbox"
            checked={parametros.usPerson}
            onChange={(e) => cambiar({ usPerson: e.target.checked })}
          />
          <span>
            <b>US person</b>
            <span className={estilos.ayuda}>bloquea el plan automático</span>
          </span>
        </label>
      </div>

      <details className={estilos.avanzado}>
        <summary>Parámetros avanzados</summary>

        <div className={estilos.grilla}>
          <label className={estilos.campo}>
            <span className={estilos.etiqueta}>Check institucional</span>
            <select
              value={parametros.institucional}
              onChange={(e) => cambiar({ institucional: e.target.value as EstadoInstitucional })}
            >
              <option value="auto">Automático</option>
              <option value="si">Sí, califica</option>
              <option value="no">No califica</option>
            </select>
            <span className={estilos.ayuda}>
              automático abre los fondos FM con la nota al pie; forzar queda en la bitácora
            </span>
          </label>

          <label className={estilos.campo}>
            <span className={estilos.etiqueta}>Colchón de liquidez</span>
            <CampoNumero
              className="mono"
              aria-label="Colchón de liquidez"
              texto={paraInput(parametros.colchonLiquidezUsd)}
              alCambiar={(valor) => cambiar({ colchonLiquidezUsd: valor ?? 0 })}
            />
            <span className={estilos.ayuda}>clava ese monto en cash dentro del ticket</span>
          </label>

          <label className={estilos.campo}>
            <span className={estilos.etiqueta}>Ticket mínimo de ETF</span>
            <CampoNumero
              className="mono"
              aria-label="Ticket mínimo de ETF"
              texto={paraInput(parametros.ticketMinimoUsd)}
              alCambiar={(valor) => cambiar({ ticketMinimoUsd: valor ?? 0 })}
            />
            <span className={estilos.ayuda}>debajo de la mitad, la línea se descarta</span>
          </label>

          <label className={estilos.campo}>
            <span className={estilos.etiqueta}>FX PEN/USD</span>
            <CampoNumero
              className="mono"
              aria-label="FX PEN/USD"
              texto={paraInput(parametros.fxPenUsd)}
              alCambiar={(valor) => cambiar({ fxPenUsd: valor ?? 0 })}
            />
            <span className={estilos.ayuda}>solo para el check institucional</span>
          </label>

          <label className={estilos.interruptor}>
            <input
              type="checkbox"
              checked={parametros.incluirInmueblesDeRenta}
              onChange={(e) => cambiar({ incluirInmueblesDeRenta: e.target.checked })}
            />
            <span>
              <b>Inmuebles de renta en el patrimonio financiero</b>
              <span className={estilos.ayuda}>
                {inmueblesRentaUsd > 0
                  ? `mueve ${usd(inmueblesRentaUsd)} dentro o fuera del cálculo y cambia el modelo entero`
                  : 'esta ficha no trae inmuebles en renta'}
              </span>
            </span>
          </label>

          {/*
            La otra pregunta del inmobiliario, y no es la misma: la de arriba
            dice si lo que el cliente YA TIENE cuenta como patrimonio
            financiero; esta dice si el modelo le puede proponer inmobiliario
            NUEVO. Van juntas para que la diferencia se lea de una vez.
          */}
          <label className={estilos.interruptor}>
            <input
              type="checkbox"
              checked={parametros.accedeInmobiliario}
              onChange={(e) => cambiar({ accedeInmobiliario: e.target.checked })}
            />
            <span>
              <b>El cliente accede a Inmobiliario Directo</b>
              <span className={estilos.ayuda}>
                apagado, el peso de la clase se reparte: hasta el umbral va a Renta Fija y
                Variable, por encima a Mercados Privados. Un inmueble conservado la salva igual.
              </span>
            </span>
          </label>
        </div>
      </details>
    </section>
  )
}
