import Link from 'next/link'
import type { ReactNode } from 'react'

import { InterruptorTema } from './InterruptorTema'
import { Rail } from './Rail'
import type { Seccion } from './Rail'
import estilos from './Marco.module.css'

export interface Miga {
  readonly texto: string
  readonly ruta?: string
}

interface Props {
  readonly asesor: { readonly nombre: string; readonly rol: string }
  readonly activo: Seccion
  readonly migas: readonly Miga[]
  /** Lo que va a la derecha de la barra: estado de guardado, salir, etc. */
  readonly acciones?: ReactNode
  readonly children: ReactNode
}

/**
 * El marco de la aplicacion: rail a la izquierda, barra arriba, trabajo al medio.
 *
 * La barra superior es la unica que sabe donde esta parado el asesor, asi que
 * es tambien donde vive el estado de guardado y el cambio de tema. Todo lo
 * demas de la pantalla cuelga de `children` y puede desplazarse solo: el rail
 * y la barra no se mueven.
 */
export function Marco({ asesor, activo, migas, acciones, children }: Props) {
  return (
    <div className={estilos.marco}>
      <Rail asesor={asesor} activo={activo} />

      <div className={estilos.trabajo}>
        <header className={estilos.barra}>
          <nav className={estilos.migas} aria-label="Ubicación">
            {migas.map((miga, i) => (
              <span key={miga.texto} className={estilos.miga}>
                {i > 0 && (
                  <span className={estilos.separador} aria-hidden="true">
                    /
                  </span>
                )}
                {miga.ruta === undefined ? (
                  <span className={i === migas.length - 1 ? estilos.actual : undefined}>
                    {miga.texto}
                  </span>
                ) : (
                  <Link href={miga.ruta} className={estilos.enlace}>
                    {miga.texto}
                  </Link>
                )}
              </span>
            ))}
          </nav>

          <div className={estilos.derecha}>
            {acciones}
            <span className={estilos.division} aria-hidden="true" />
            <InterruptorTema />
          </div>
        </header>

        <div className={estilos.contenido}>{children}</div>
      </div>
    </div>
  )
}
