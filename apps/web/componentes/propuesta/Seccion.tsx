import type { ReactNode } from 'react'

import { TOLERANCIA_CUADRE } from '@sabbi/core'

import { usdCentavos } from '../../lib/formato'
import estilos from './Propuesta.module.css'

interface Props {
  readonly numero: number
  readonly titulo: string
  readonly bajada?: string
  readonly children: ReactNode
}

/** Una sección numerada. Las siete se ven igual y por eso se leen seguidas. */
export function Seccion({ numero, titulo, bajada, children }: Props) {
  return (
    <section className={estilos.seccion} aria-labelledby={`seccion-${numero}`}>
      <div className={estilos.tituloSeccion}>
        <span className={estilos.numeroSeccion}>{String(numero).padStart(2, '0')}</span>
        <h2 id={`seccion-${numero}`}>{titulo}</h2>
      </div>
      {bajada !== undefined && <p className={estilos.bajada}>{bajada}</p>}
      {children}
    </section>
  )
}

export function Tabla({ children }: { readonly children: ReactNode }) {
  return (
    <div className={estilos.envoltorio}>
      <table className={estilos.tabla}>{children}</table>
    </div>
  )
}

/**
 * Un control de cuadre.
 *
 * No es decoración: si esta cifra no da cero, la propuesta no se publica. Por
 * eso se muestra siempre, también cuando está bien, y se lee al centavo.
 */
export function Cuadre({
  etiqueta,
  montoUsd,
  explicacion,
}: {
  readonly etiqueta: string
  readonly montoUsd: number
  readonly explicacion: string
}) {
  const roto = Math.abs(montoUsd) > TOLERANCIA_CUADRE

  return (
    <p className={`${estilos.cuadre} ${roto ? estilos.cuadreRoto : ''}`} role={roto ? 'alert' : undefined}>
      <span>{etiqueta}</span>
      <b>{usdCentavos(montoUsd)}</b>
      <span>{roto ? explicacion : 'cuadra'}</span>
    </p>
  )
}
