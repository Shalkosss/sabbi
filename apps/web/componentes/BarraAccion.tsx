'use client'

import estilos from './BarraAccion.module.css'

interface Props {
  readonly nota: string
  readonly texto: string
  readonly deshabilitado: boolean
  readonly alApretar: () => void
}

/**
 * El cierre de la pantalla.
 *
 * Pegada abajo porque la tabla es larga y la decisión de calcular no debería
 * depender de haber llegado al final. A la izquierda queda dicho por qué el
 * botón está como está: bloqueado, listo, o listo pero con posiciones que
 * nadie marcó.
 */
export function BarraAccion({ nota, texto, deshabilitado, alApretar }: Props) {
  return (
    <div className={estilos.barra}>
      <p className={estilos.nota}>{nota}</p>
      <button type="button" className="primario" disabled={deshabilitado} onClick={alApretar}>
        {texto}
      </button>
    </div>
  )
}
