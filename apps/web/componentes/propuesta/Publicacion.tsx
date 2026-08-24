'use client'

import { useState, useTransition } from 'react'

import { nuevaVersionAction, publicarAction } from '../../app/propuestas/acciones'
import estilos from './Publicacion.module.css'

/**
 * El corte entre calcular y publicar.
 *
 * Toda la herramienta está construida sobre la idea de que nada se guarda
 * calculado: se corrige la ficha y la cifra se mueve, se guarda una macro
 * nueva y se mueven todas. Publicar es el único momento en que eso se detiene,
 * y por eso es un botón y no un autoguardado: es una decisión, igual que
 * calcular.
 *
 * Lo que se congela sale escrito acá —con qué macro, con qué motor, quién y
 * cuándo— porque una cifra que llegó a un cliente tiene que poder explicarse
 * el mes que viene, cuando el catálogo ya sea otro.
 */

export interface VersionVecina {
  readonly id: string
  readonly version: number
  readonly publicada: boolean
  readonly fecha: string
}

interface Props {
  readonly propuestaId: string
  readonly version: number
  readonly publicada: boolean
  readonly publicadaEn: string | null
  readonly publicadaPor: string | null
  readonly macroVersion: number | null
  readonly motor: string | null
  /** Lo que impide publicar, ya evaluado en el servidor. Vacío: se puede. */
  readonly reparos: readonly string[]
  readonly cadena: readonly VersionVecina[]
}

export function Publicacion({
  propuestaId,
  version,
  publicada,
  publicadaEn,
  publicadaPor,
  macroVersion,
  motor,
  reparos,
  cadena,
}: Props) {
  const [enCurso, arrancar] = useTransition()
  const [error, setError] = useState<readonly string[]>([])
  const [confirmando, setConfirmando] = useState(false)

  const publicar = () => {
    setError([])
    arrancar(async () => {
      const resultado = await publicarAction(propuestaId)
      setConfirmando(false)
      if (!resultado.ok) setError([resultado.motivo, ...resultado.detalles])
    })
  }

  const versionar = () => {
    setError([])
    arrancar(async () => {
      const resultado = await nuevaVersionAction(propuestaId)
      if (resultado.error !== '') setError([resultado.error])
    })
  }

  return (
    <section className={estilos.panel} aria-labelledby="publicacion">
      <div className={estilos.cabecera}>
        <div>
          <p className="eyebrow" id="publicacion">
            {publicada ? 'Publicada' : 'Borrador'} · v{version}
          </p>
          <p className={estilos.bajada}>
            {publicada ? (
              <>
                Congelada{publicadaEn === null ? '' : <> el <Fecha iso={publicadaEn} /></>}
                {publicadaPor === null ? '' : ` por ${publicadaPor}`}
                {macroVersion === null
                  ? ', con la macro de fábrica'
                  : `, con la macro v${macroVersion}`}
                {motor === null ? '' : ` y el motor ${motor}`}. Estas cifras ya no se recalculan:
                son las que salieron.
              </>
            ) : (
              <>
                Se recalcula cada vez que se abre, con la ficha y la macro de hoy. Publicarla
                congela estas cifras y cierra la propuesta a más cambios.
              </>
            )}
          </p>
        </div>

        <div className={estilos.acciones}>
          {publicada ? (
            <button type="button" onClick={versionar} disabled={enCurso}>
              {enCurso ? 'Abriendo…' : 'Crear versión nueva'}
            </button>
          ) : reparos.length > 0 ? (
            <button type="button" disabled title="Resolvé los reparos de abajo">
              Publicar
            </button>
          ) : confirmando ? (
            <>
              <button type="button" onClick={publicar} disabled={enCurso}>
                {enCurso ? 'Congelando…' : 'Sí, publicar v' + version}
              </button>
              <button
                type="button"
                className="secundario"
                onClick={() => setConfirmando(false)}
                disabled={enCurso}
              >
                Cancelar
              </button>
            </>
          ) : (
            <button type="button" onClick={() => setConfirmando(true)}>
              Publicar
            </button>
          )}
        </div>
      </div>

      {!publicada && reparos.length > 0 && (
        <div className={estilos.reparos}>
          <p className={estilos.tituloReparos}>Antes de publicar hay que resolver esto:</p>
          <ul>
            {reparos.map((reparo) => (
              <li key={reparo}>{reparo}</li>
            ))}
          </ul>
        </div>
      )}

      {error.length > 0 && (
        <div className={estilos.error} role="alert">
          {error.map((linea) => (
            <p key={linea}>{linea}</p>
          ))}
        </div>
      )}

      {cadena.length > 1 && (
        <div className={estilos.cadena}>
          <p className={estilos.tituloCadena}>Versiones de esta ficha</p>
          <ul>
            {cadena.map((vecina) => (
              <li key={vecina.id}>
                {vecina.id === propuestaId ? (
                  <span className={estilos.actual}>
                    v{vecina.version} · {vecina.publicada ? 'publicada' : 'borrador'} · esta
                  </span>
                ) : (
                  <a href={`/propuestas/${vecina.id}`}>
                    v{vecina.version} · {vecina.publicada ? 'publicada' : 'borrador'} ·{' '}
                    <Fecha iso={vecina.fecha} />
                  </a>
                )}
              </li>
            ))}
          </ul>
        </div>
      )}
    </section>
  )
}

/** Zona fija, como en el resto de la aplicación: si no, el servidor y el navegador difieren. */
function Fecha({ iso }: { readonly iso: string }) {
  const formato = new Intl.DateTimeFormat('es-PE', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
    timeZone: 'America/Lima',
  })

  return <time dateTime={iso}>{formato.format(new Date(iso))}</time>
}
