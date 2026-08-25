'use client'

import { useId, useState } from 'react'

import type { Parametros } from '../lib/estado'
import { PanelParametros } from './PanelParametros'
import estilos from './BarraParametros.module.css'

interface Props {
  readonly parametros: Parametros
  readonly cambiar: (cambios: Partial<Parametros>) => void
  readonly patrimonioUsd: number
  readonly inmueblesRentaUsd: number
  readonly flujoDeclarado: string | null
}

/**
 * Los parametros, plegados.
 *
 * Se tocan una vez por propuesta y despues estorban. La linea llegó a listar
 * los seis —flujos, institucional, colchon, ticket— y ninguno de esos cinco se
 * mira dos veces: son estado, no informacion, y ocupaban el ancho entero de la
 * pantalla antes de la primera fila de la ficha.
 *
 * Queda el perfil, que es el unico que cambia el plan entero si quedo mal, y
 * el aviso de US person, que lo bloquea. El resto vive detras de «Ajustar»,
 * que es cuando se lo va a buscar.
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

  return (
    <section className={estilos.bloque} aria-label="Parámetros de la propuesta">
      <div className={estilos.barra}>
        <p className={estilos.titulo}>Parámetros</p>

        <div className={estilos.valores}>
          <span className={estilos.par}>
            <span className={estilos.etiqueta}>Perfil</span>
            <span className={estilos.valor}>{parametros.perfil}</span>
          </span>

          {/*
            US person no es un parámetro más: bloquea el plan automático. Si
            está puesto no puede quedar detrás de un botón, porque explica por
            qué la propuesta no sale.
          */}
          {parametros.usPerson && (
            <span className={estilos.bloqueo}>US person — el plan automático no aplica</span>
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
