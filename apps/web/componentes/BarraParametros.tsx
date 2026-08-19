'use client'

import { useId, useState } from 'react'

import type { Parametros } from '../lib/estado'
import { usdCorto } from '../lib/formato'
import { PanelParametros } from './PanelParametros'
import estilos from './BarraParametros.module.css'

interface Props {
  readonly parametros: Parametros
  readonly cambiar: (cambios: Partial<Parametros>) => void
  readonly patrimonioUsd: number
  readonly inmueblesRentaUsd: number
  readonly flujoDeclarado: string | null
}

const INSTITUCIONAL: Readonly<Record<string, string>> = {
  auto: 'Automático',
  si: 'Sí califica',
  no: 'No califica',
}

/**
 * Los parametros, plegados.
 *
 * Se tocan una vez por propuesta y despues estorban, pero olvidarse de que el
 * perfil quedo en Moderado arruina el plan entero. Asi que quedan siempre a la
 * vista en una linea, y solo se abren cuando hay algo que cambiar.
 */
export function BarraParametros({
  parametros,
  cambiar,
  patrimonioUsd,
  inmueblesRentaUsd,
  flujoDeclarado,
}: Props) {
  const [abierto, setAbierto] = useState(false)
  const panelId = useId()

  const resumen = [
    { etiqueta: 'Perfil', valor: parametros.perfil },
    { etiqueta: 'Flujos', valor: parametros.necesitaFlujos ? 'Sí' : 'No' },
    { etiqueta: 'Institucional', valor: INSTITUCIONAL[parametros.institucional] ?? '—' },
    { etiqueta: 'Colchón', valor: usdCorto(parametros.colchonLiquidezUsd) },
    { etiqueta: 'ETF mínimo', valor: usdCorto(parametros.ticketMinimoUsd) },
    ...(parametros.usPerson ? [{ etiqueta: 'US person', valor: 'Sí' }] : []),
  ]

  return (
    <section className={estilos.bloque} aria-label="Parámetros de la propuesta">
      <div className={estilos.barra}>
        <p className={estilos.titulo}>Parámetros</p>

        <div className={estilos.valores}>
          {resumen.map((par) => (
            <span key={par.etiqueta} className={estilos.par}>
              <span className={estilos.etiqueta}>{par.etiqueta}</span>
              <span className={estilos.valor}>{par.valor}</span>
            </span>
          ))}
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

      <div id={panelId} hidden={!abierto}>
        <PanelParametros
          parametros={parametros}
          cambiar={cambiar}
          patrimonioUsd={patrimonioUsd}
          inmueblesRentaUsd={inmueblesRentaUsd}
          flujoDeclarado={flujoDeclarado}
        />
      </div>
    </section>
  )
}
