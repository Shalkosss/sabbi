'use client'

import type { EstadoCola } from '../lib/cola'
import { plural } from '../lib/formato'
import estilos from './Guardado.module.css'

interface Props {
  readonly estado: EstadoCola
  /** Filas que la base no acepta todavía, por un monto a vender imposible. */
  readonly sinGuardar: number
}

/**
 * El estado del autoguardado, en una línea.
 *
 * Sin botón de guardar, esto es lo único que le dice al asesor que su trabajo
 * está a salvo. Por eso dice también cuando no lo está: un cambio que la base
 * rechazó no puede quedarse callado.
 */
export function Guardado({ estado, sinGuardar }: Props) {
  if (estado.error !== null) {
    return (
      <p role="alert" className={`${estilos.estado} ${estilos.error}`}>
        <span className={estilos.punto} aria-hidden="true" />
        No pude guardar: {estado.error}
      </p>
    )
  }

  if (sinGuardar > 0) {
    return (
      <p role="status" className={`${estilos.estado} ${estilos.pendiente}`}>
        <span className={estilos.punto} aria-hidden="true" />
        {plural(sinGuardar, 'fila sin guardar', 'filas sin guardar')}: el monto a vender supera la
        posición
      </p>
    )
  }

  const texto =
    estado.fase === 'guardando'
      ? 'Guardando…'
      : estado.fase === 'guardado'
        ? 'Guardado'
        : 'Se guarda solo'

  return (
    <p role="status" className={`${estilos.estado} ${estilos[estado.fase] ?? ''}`}>
      <span className={estilos.punto} aria-hidden="true" />
      {texto}
    </p>
  )
}
