'use client'

import { useMemo, useState, useTransition } from 'react'

import { marcarHitoAction } from '../../app/agenda/acciones'
import {
  PLAZO_HABILES,
  armarMes,
  diaLargo,
  mesCorrido,
  mesDe,
  nombreDeMes,
  rutasDe,
  tramosDelMes,
} from '../../lib/agenda'
import type { ClaveHito, Dia, FichaEnAgenda, Ruta } from '../../lib/agenda'
import { plural } from '../../lib/formato'
import { Mes } from './Mes'
import { RutaCliente } from './RutaCliente'
import estilos from './Agenda.module.css'

/**
 * La agenda de entregas.
 *
 * Dos mitades con trabajos distintos. El calendario contesta *cuándo*: una
 * barra por cliente, del día que llegó su ficha al cuarto día hábil, y nada
 * más — la primera versión ponía los cinco hitos como píldoras sueltas y un
 * mes con ocho clientes era una pared de etiquetas. «En ruta» contesta *qué
 * falta*: las rutas abiertas ordenadas por urgencia, cada una con sus cinco
 * hitos y sus casillas.
 *
 * Lo que las une es el color del cliente y el encendido: apoyar el puntero
 * sobre una barra levanta su tarjeta, y al revés. Nada se filtra para mirar a
 * uno solo.
 */

interface Props {
  readonly fichas: readonly FichaEnAgenda[]
  /** El día de hoy en Lima, resuelto en el servidor. */
  readonly hoy: Dia
  readonly esAdmin: boolean
  readonly sinTablaDeHitos: boolean
}

/** Clave de una marca local, mientras el servidor todavía no contestó. */
const marca = (fichaId: string, hito: ClaveHito) => `${fichaId}|${hito}`

interface Grupo {
  readonly titulo: string
  readonly rutas: readonly Ruta[]
  readonly urgente?: boolean
}

export function Agenda({ fichas, hoy, esAdmin, sinTablaDeHitos }: Props) {
  const [vista, setVista] = useState(() => mesDe(hoy))
  const [abierta, setAbierta] = useState<string | null>(null)
  const [enfocada, setEnfocada] = useState<string | null>(null)
  const [soloMias, setSoloMias] = useState(false)
  const [conEntregadas, setConEntregadas] = useState(false)
  const [error, setError] = useState<string | null>(null)
  // Lo que el asesor acaba de marcar y el servidor todavía no devolvió. Sin
  // esto la casilla se queda como estaba hasta que vuelve la revalidación, y
  // parece que el clic no hizo nada.
  const [marcas, setMarcas] = useState<Readonly<Record<string, boolean>>>({})
  const [enVuelo, empezar] = useTransition()

  const rutas = useMemo(() => {
    const conMarcas = fichas.map((ficha): FichaEnAgenda => {
      const hechos = new Set(ficha.hechos)
      for (const [clave, hecho] of Object.entries(marcas)) {
        const [fichaId, hito] = clave.split('|')
        if (fichaId !== ficha.fichaId || hito === undefined) continue
        if (hecho) hechos.add(hito as ClaveHito)
        else hechos.delete(hito as ClaveHito)
      }
      return { ...ficha, hechos: [...hechos] }
    })

    return rutasDe(conMarcas, hoy)
  }, [fichas, marcas, hoy])

  const visibles = useMemo(
    () => (soloMias ? rutas.filter((ruta) => ruta.mio) : rutas),
    [rutas, soloMias],
  )

  const mes = useMemo(() => armarMes(vista.anio, vista.mes), [vista])
  const tramos = useMemo(() => tramosDelMes(mes, visibles, hoy), [mes, visibles, hoy])

  // Por urgencia y no por fecha: la lista es lo que hay que hacer hoy, y lo que
  // se venció manda sobre lo que entra la semana que viene.
  const grupos = useMemo((): readonly Grupo[] => {
    const orden = (a: Ruta, b: Ruta) =>
      a.entrega.localeCompare(b.entrega) || a.cliente.localeCompare(b.cliente, 'es')

    const abiertas = visibles.filter((ruta) => ruta.avance < 1)
    const vencidas = abiertas.filter((ruta) => ruta.vencida).sort(orden)
    const resto = abiertas.filter((ruta) => !ruta.vencida)

    return [
      { titulo: 'Vencidas', rutas: vencidas, urgente: true },
      { titulo: 'Entrega hoy', rutas: resto.filter((r) => r.faltanParaEntrega === 0).sort(orden) },
      {
        titulo: 'Esta semana',
        rutas: resto
          .filter((r) => r.faltanParaEntrega > 0 && r.faltanParaEntrega <= PLAZO_HABILES)
          .sort(orden),
      },
      {
        titulo: 'Más adelante',
        rutas: resto.filter((r) => r.faltanParaEntrega > PLAZO_HABILES).sort(orden),
      },
      ...(conEntregadas
        ? [
            {
              titulo: 'Entregadas',
              rutas: visibles
                .filter((ruta) => ruta.avance === 1)
                .sort((a, b) => b.entrega.localeCompare(a.entrega))
                .slice(0, 20),
            },
          ]
        : []),
    ].filter((grupo) => grupo.rutas.length > 0)
  }, [visibles, conEntregadas])

  const enRuta = useMemo(() => visibles.filter((ruta) => ruta.avance < 1).length, [visibles])
  const vencidas = useMemo(
    () => visibles.filter((ruta) => ruta.vencida).length,
    [visibles],
  )

  const irA = (pasos: number) => setVista((actual) => mesCorrido(actual.anio, actual.mes, pasos))

  /** Abrir una ruta desde el calendario lleva la vista a su tarjeta. */
  const abrir = (fichaId: string | null) => {
    setAbierta(fichaId)
    if (fichaId === null) return
    document
      .getElementById(`ruta-${fichaId}`)
      ?.scrollIntoView({ block: 'nearest', behavior: 'smooth' })
  }

  const alternarHito = (ruta: Ruta, hito: ClaveHito, hecho: boolean) => {
    const clave = marca(ruta.fichaId, hito)
    setMarcas((previas) => ({ ...previas, [clave]: hecho }))
    setError(null)

    empezar(() => {
      void marcarHitoAction(ruta.fichaId, hito, hecho).then((resultado) => {
        if (resultado.error === undefined) return
        // Vuelve a lo que decía la base: una casilla marcada que no se guardó
        // es peor que una que no se marcó.
        setMarcas((previas) => {
          const { [clave]: _descartada, ...resto } = previas
          return resto
        })
        setError(resultado.error)
      })
    })
  }

  return (
    <div className={estilos.hoja}>
      <header className={estilos.cabecera}>
        <p className="eyebrow">Agenda</p>
        <h1>{PLAZO_HABILES} días hábiles desde la ficha</h1>
        <p className={estilos.bajada}>
          El plazo arranca el día que llega la ficha del cliente y corre en días hábiles hasta la
          entrega. Nadie teclea una fecha: se calcula sobre la subida y sobre el calendario
          peruano, feriados incluidos. En el calendario cada cliente es una barra —cuándo entró y
          hasta cuándo hay tiempo—; los hitos de adentro se trabajan en <b>En ruta</b>.
        </p>
      </header>

      {sinTablaDeHitos && (
        <p className={estilos.aviso}>
          Las fechas salen igual porque son un cálculo, pero esta base todavía no tiene la tabla de
          hitos: hasta que corra <code>npm run migrar</code> no se puede marcar nada como cumplido.
        </p>
      )}

      {error !== null && (
        <p className={estilos.problema} role="status">
          {error}
        </p>
      )}

      <div className={estilos.barra}>
        <div className={estilos.navegacion}>
          <button
            type="button"
            className={estilos.paso}
            onClick={() => irA(-1)}
            aria-label="Mes anterior"
          >
            ‹
          </button>
          <h2 className={estilos.mes} aria-live="polite">
            {nombreDeMes(vista.mes)} <span className={estilos.anio}>{vista.anio}</span>
          </h2>
          <button
            type="button"
            className={estilos.paso}
            onClick={() => irA(1)}
            aria-label="Mes siguiente"
          >
            ›
          </button>
          <button type="button" className="secundario" onClick={() => setVista(mesDe(hoy))}>
            Hoy
          </button>
        </div>

        <div className={estilos.filtros}>
          {vencidas > 0 && (
            <span className={estilos.atrasadas}>
              {plural(vencidas, 'ruta vencida', 'rutas vencidas')}
            </span>
          )}
          <label className={estilos.interruptor}>
            <input
              type="checkbox"
              checked={soloMias}
              onChange={(evento) => setSoloMias(evento.target.checked)}
            />
            Solo mis fichas
          </label>
        </div>
      </div>

      <div className={estilos.tablero}>
        <Mes
          mes={mes}
          hoy={hoy}
          rutas={visibles}
          tramos={tramos}
          enfocada={enfocada}
          alEnfocar={setEnfocada}
          alAbrir={abrir}
        />

        <aside className={estilos.costado} aria-label="Rutas abiertas">
          <div className={estilos.bloque}>
            <div className={estilos.tituloBloque}>
              <h3>En ruta</h3>
              <span className={estilos.cuenta}>{plural(enRuta, 'cliente', 'clientes')}</span>
            </div>

            {grupos.length === 0 ? (
              <p className={estilos.vacio}>
                Ninguna ruta abierta{soloMias ? ' entre tus fichas' : ''}. Subí una ficha y el
                plazo arranca solo.
              </p>
            ) : (
              <div className={estilos.grupos}>
                {grupos.map((grupo) => (
                  <section key={grupo.titulo} className={estilos.grupo}>
                    <p className={estilos.tituloGrupo} data-urgente={grupo.urgente || undefined}>
                      {grupo.titulo}
                      <span className={estilos.cuentaGrupo}>{grupo.rutas.length}</span>
                    </p>
                    <ul className={estilos.rutas}>
                      {grupo.rutas.map((ruta) => (
                        <RutaCliente
                          key={ruta.fichaId}
                          id={`ruta-${ruta.fichaId}`}
                          ruta={ruta}
                          abierta={abierta === ruta.fichaId}
                          atenuada={enfocada !== null && enfocada !== ruta.fichaId}
                          esAdmin={esAdmin}
                          puedeMarcar={!sinTablaDeHitos}
                          guardando={enVuelo}
                          alAbrir={setAbierta}
                          alEnfocar={setEnfocada}
                          alAlternar={alternarHito}
                        />
                      ))}
                    </ul>
                  </section>
                ))}
              </div>
            )}

            <label className={`${estilos.interruptor} ${estilos.verEntregadas}`}>
              <input
                type="checkbox"
                checked={conEntregadas}
                onChange={(evento) => setConEntregadas(evento.target.checked)}
              />
              Ver también las entregadas
            </label>
          </div>

          <section className={estilos.bloque} aria-labelledby="como-leerlo">
            <div className={estilos.tituloBloque}>
              <h3 id="como-leerlo">Cómo leerlo</h3>
            </div>
            <ul className={estilos.leyenda}>
              <li>
                <span className={estilos.muestraBarra} aria-hidden="true" />
                Cada barra es un cliente: empieza cuando llega su ficha y termina en la entrega, a{' '}
                {PLAZO_HABILES} días hábiles.
              </li>
              <li>
                <span className={estilos.muestraRampa} aria-hidden="true" />
                Lo vivido va firme y lo que falta se disuelve: la certeza se gana con los días.
              </li>
              <li>
                <span className={estilos.muestraVencida} aria-hidden="true" />
                En rojo, la ruta a la que se le pasó la fecha de entrega.
              </li>
            </ul>
            <p className={estilos.pieLeyenda}>
              Hoy es {diaLargo(hoy)}. El plazo salta sábados, domingos y feriados nacionales —
              Jueves y Viernes Santo incluidos, que se mueven cada año.
            </p>
          </section>
        </aside>
      </div>
    </div>
  )
}
