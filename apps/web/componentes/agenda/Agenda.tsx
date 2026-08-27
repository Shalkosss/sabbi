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
  porDia,
  rutasDe,
} from '../../lib/agenda'
import type { ClaveHito, Dia, FichaEnAgenda, Ruta } from '../../lib/agenda'
import { plural } from '../../lib/formato'
import { Mes } from './Mes'
import { PanelDia } from './PanelDia'
import { RutaCliente } from './RutaCliente'
import estilos from './Agenda.module.css'

/**
 * La agenda de entregas.
 *
 * Un calendario que nadie llena: cada ficha subida abre sola su ruta de cuatro
 * días hábiles, y lo que se ve es esa ruta puesta sobre el mes. La única
 * escritura de la pantalla es marcar un hito como cumplido — la fecha no se
 * teclea porque no es un dato, es una cuenta.
 *
 * Tres decisiones sostienen la lectura:
 *
 * - **El color es del cliente, no del hito.** Ocho tonos derivados del id de
 *   la ficha, siempre el mismo para el mismo cliente. Y nunca solo el color:
 *   cada píldora lleva las iniciales y el nombre, porque ocho tonos no
 *   alcanzan para veinte clientes y porque un calendario que solo se lee por
 *   color no se lee.
 * - **La certeza se dibuja.** Lo que ya pasó es un hecho y va firme; lo que
 *   viene se difumina con la distancia, que es exactamente lo que vale una
 *   fecha tentativa a cuatro días. La difusión toca el fondo y el halo, nunca
 *   el texto: una fecha borrosa no se puede leer.
 * - **Un cliente a la vez.** Apoyar el puntero sobre cualquier píldora enciende
 *   toda la ruta de ese cliente y apaga el resto. Es la forma de contestar
 *   «¿cómo viene Ana?» sin filtrar nada.
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

export function Agenda({ fichas, hoy, esAdmin, sinTablaDeHitos }: Props) {
  const [vista, setVista] = useState(() => mesDe(hoy))
  const [diaElegido, setDiaElegido] = useState<Dia>(hoy)
  const [enfocado, setEnfocado] = useState<string | null>(null)
  const [soloMias, setSoloMias] = useState(false)
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

    return [...rutasDe(conMarcas, hoy)]
      .sort((a, b) => a.entrega.localeCompare(b.entrega) || a.cliente.localeCompare(b.cliente, 'es'))
  }, [fichas, marcas, hoy])

  const visibles = useMemo(
    () => (soloMias ? rutas.filter((ruta) => ruta.mio) : rutas),
    [rutas, soloMias],
  )

  const calendario = useMemo(() => porDia(visibles), [visibles])
  const mes = useMemo(() => armarMes(vista.anio, vista.mes), [vista])

  // Las que todavía no llegaron a su entrega: es la carga real de la mesa.
  const enRuta = useMemo(
    () => visibles.filter((ruta) => ruta.avance < 1).slice(0, 40),
    [visibles],
  )
  const atrasadas = useMemo(() => visibles.filter((ruta) => ruta.atrasados > 0).length, [visibles])

  const irA = (pasos: number) => setVista((actual) => mesCorrido(actual.anio, actual.mes, pasos))

  const alHoy = () => {
    setVista(mesDe(hoy))
    setDiaElegido(hoy)
  }

  const elegirDia = (dia: Dia) => {
    setDiaElegido(dia)
    const suyo = mesDe(dia)
    // Apretar un día del mes vecino lleva la vista a ese mes: si no, la celda
    // elegida se queda fuera de la grilla y el panel habla de un día invisible.
    if (suyo.anio !== vista.anio || suyo.mes !== vista.mes) setVista(suyo)
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
          El plazo arranca el día que se sube la ficha patrimonial y corre en días hábiles: el
          portafolio al primero, el PPT al segundo, la revisión de la mesa al tercero y la entrega
          al cuarto. Nadie teclea una fecha — se calculan sobre la subida y sobre el calendario
          peruano, feriados incluidos. Las de más adelante se dibujan difusas: son tentativas hasta
          que se acercan.
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
          <button type="button" className="secundario" onClick={alHoy}>
            Hoy
          </button>
        </div>

        <div className={estilos.filtros}>
          {atrasadas > 0 && (
            <span className={estilos.atrasadas}>
              {plural(atrasadas, 'ruta atrasada', 'rutas atrasadas')}
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
          diaElegido={diaElegido}
          calendario={calendario}
          enfocado={enfocado}
          alElegirDia={elegirDia}
          alEnfocar={setEnfocado}
        />

        <aside className={estilos.costado}>
          <PanelDia
            dia={diaElegido}
            hoy={hoy}
            entradas={calendario.get(diaElegido) ?? []}
            esAdmin={esAdmin}
            puedeMarcar={!sinTablaDeHitos}
            guardando={enVuelo}
            enfocado={enfocado}
            alEnfocar={setEnfocado}
            alAlternar={alternarHito}
          />

          <section className={estilos.bloque} aria-labelledby="en-ruta">
            <div className={estilos.tituloBloque}>
              <h3 id="en-ruta">En ruta</h3>
              <span className={estilos.cuenta}>
                {plural(enRuta.length, 'cliente', 'clientes')}
              </span>
            </div>

            {enRuta.length === 0 ? (
              <p className={estilos.vacio}>
                Ninguna ruta abierta{soloMias ? ' entre tus fichas' : ''}. Subí una ficha y el plazo
                arranca solo.
              </p>
            ) : (
              <ul className={estilos.rutas}>
                {enRuta.map((ruta) => (
                  <RutaCliente
                    key={ruta.fichaId}
                    ruta={ruta}
                    hoy={hoy}
                    enfocada={enfocado === ruta.fichaId}
                    atenuada={enfocado !== null && enfocado !== ruta.fichaId}
                    alEnfocar={setEnfocado}
                    alElegirDia={elegirDia}
                  />
                ))}
              </ul>
            )}
          </section>

          <section className={estilos.bloque} aria-labelledby="como-leerlo">
            <div className={estilos.tituloBloque}>
              <h3 id="como-leerlo">Cómo leerlo</h3>
            </div>
            <ul className={estilos.leyenda}>
              <li>
                <span className={estilos.muestraRampa} aria-hidden="true" />
                Cuanto más lejos el hito, más difuso: la certeza se gana con los días.
              </li>
              <li>
                <span className={`${estilos.muestra} ${estilos.muestraHecho}`} aria-hidden="true" />
                Cumplido. Lo marca el dueño de la ficha.
              </li>
              <li>
                <span className={`${estilos.muestra} ${estilos.muestraVencido}`} aria-hidden="true" />
                Venció y sigue sin marcar.
              </li>
              <li>
                <span className={`${estilos.muestra} ${estilos.muestraEntrega}`} aria-hidden="true" />
                La entrega. Es la única fecha que no se mueve.
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
