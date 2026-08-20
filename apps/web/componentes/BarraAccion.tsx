'use client'

import Link from 'next/link'

import estilos from './BarraAccion.module.css'

/** Una salida de la pantalla. `descarga` la resuelve el navegador, no el router. */
export interface Salida {
  readonly href: string
  readonly texto: string
  readonly descarga?: boolean
  readonly titulo?: string
}

interface Props {
  readonly nota: string
  readonly texto: string
  readonly deshabilitado: boolean
  readonly alApretar: () => void
  /**
   * A dónde se puede ir desde acá.
   *
   * Vacío mientras no haya plan. Una vez calculado, la barra es el único lugar
   * donde el asesor mira: dejar la salida en un enlace chico dentro del panel
   * de resultados era un callejón sin salida — se calculaba el plan y ahí se
   * terminaba la pantalla.
   */
  readonly salidas?: readonly Salida[]
}

/**
 * El cierre de la pantalla.
 *
 * Pegada abajo porque la tabla es larga y la decisión de calcular no debería
 * depender de haber llegado al final. A la izquierda queda dicho por qué el
 * botón está como está: bloqueado, listo, o listo pero con posiciones que
 * nadie marcó. A la derecha, adónde se sigue.
 */
export function BarraAccion({ nota, texto, deshabilitado, alApretar, salidas = [] }: Props) {
  const ultima = salidas.length - 1

  return (
    <div className={estilos.barra}>
      <p className={estilos.nota}>{nota}</p>

      <button
        type="button"
        className={salidas.length === 0 ? 'primario' : 'secundario'}
        disabled={deshabilitado}
        onClick={alApretar}
      >
        {texto}
      </button>

      {salidas.map((salida, indice) =>
        salida.descarga === true ? (
          <a
            key={salida.href}
            href={salida.href}
            className="secundario"
            title={salida.titulo}
            download
          >
            {salida.texto}
          </a>
        ) : (
          <Link
            key={salida.href}
            href={salida.href}
            className={indice === ultima ? 'primario' : 'secundario'}
            title={salida.titulo}
          >
            {salida.texto}
          </Link>
        ),
      )}
    </div>
  )
}
