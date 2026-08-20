'use client'

import { useState } from 'react'

import type { Matriz, Portafolio } from '../lib/benchmark'
import { NOMBRE_CLASE, NOMBRE_CLASE_CORTO, ORDEN_CLASES } from '../lib/clases'
import { pct1, plural, usdCorto, usdTabla } from '../lib/formato'
import { GraficoBenchmark } from './GraficoBenchmark'
import estilos from './Benchmark.module.css'

/**
 * El universo del motor, ticket por ticket y perfil por perfil.
 *
 * No es la propuesta de nadie: es el modelo corrido en vacío, sin ficha y sin
 * posiciones conservadas. Sirve para mirar las reglas de frente — cuáles
 * clases abren, cuáles no llegan a su mínimo y a dónde va lo que no llega — y
 * para ver de un vistazo qué cambia cuando la mesa toca los pesos.
 *
 * Las veinte filas se leen juntas a propósito. Una propuesta se mira de a una;
 * un modelo se juzga por lo que hace en todo su rango, y sobre todo por lo que
 * hace en los bordes.
 */
export function Benchmark({ matriz }: { readonly matriz: Matriz }) {
  const [abierta, setAbierta] = useState<string | null>(null)
  const clave = (p: Portafolio) => `${p.ticketUsd}-${p.perfil}`

  return (
    <div className={estilos.hoja}>
      <header className={estilos.cabecera}>
        <p className="eyebrow">Benchmark</p>
        <h1>Los {matriz.portafolios.length} portafolios del modelo</h1>
        <p className={estilos.bajada}>
          El motor corrido en vacío: {plural(matriz.tickets.length, 'ticket', 'tickets')} contra{' '}
          {plural(matriz.perfiles.length, 'perfil', 'perfiles')}, sin ficha y sin nada
          conservado. Es lo que el modelo propone a un cliente que llega con dinero y nada más.
        </p>
      </header>

      <form className={estilos.reglas} method="get">
        <p className={estilos.tituloReglas}>Reglas del portafolio</p>

        <label className={estilos.campo}>
          <span>Perfiles a mirar</span>
          <select name="perfiles" defaultValue={matriz.vista}>
            <option value="5">Los cinco</option>
            <option value="3">Tres: Conservador, Moderado y Arriesgado</option>
            <option value="2">Dos: Conservador contra Moderado</option>
          </select>
        </label>

        <label className={estilos.campo}>
          <span>Inmobiliario disuelto</span>
          <select name="inm" defaultValue={matriz.reglas.inmobiliario}>
            <option value="prorratear">Se prorratea entre las cinco clases</option>
            <option value="alternativos">Pasa entero a Privados, Club y Otros</option>
          </select>
        </label>

        <label className={estilos.campo}>
          <span>Umbral inmobiliario</span>
          {/*
            `step` libre a propósito. Con un paso de 50,000 el navegador
            rechazaba cualquier número que no cayera en la grilla y lo decía
            con un mensaje que no se entiende — «introduce un valor entre
            150001 y 20001» —, así que la regla no se podía cambiar. Estos
            umbrales los mueve la mesa y no tienen por qué ser redondos.
          */}
          <input
            type="number"
            name="umbral"
            min={0}
            step="any"
            defaultValue={matriz.reglas.umbralInmobiliarioUsd}
            className="mono"
          />
        </label>

        <label className={estilos.campo}>
          <span>Ticket mínimo de ETF</span>
          <input
            type="number"
            name="etf"
            min={1}
            step="any"
            defaultValue={matriz.reglas.ticketEtfUsd}
            className="mono"
          />
        </label>

        <button type="submit" className="secundario">
          Volver a correr
        </button>

        {!matriz.esLaMacroDeLaPropuesta && (
          <p className={estilos.desviada}>
            Estas no son las reglas de la macro v8. Lo que ves acá no es lo que la propuesta le
            entrega hoy a un cliente.{' '}
            <a href="/benchmark">Volver a las de la propuesta</a>
          </p>
        )}
      </form>

      <p className={estilos.nota}>
        La diferencia entre las dos reglas es la que separa las dos hojas con las que la mesa
        venía trabajando. Sobre un perfil Moderado, prorratear le da{' '}
        <b>{pct1(0.2585)}</b> a Renta Fija; mandarlo al bloque alternativo le deja{' '}
        <b>{pct1(0.1899)}</b>. Casi siete puntos, con el mismo benchmark y el mismo ticket.
      </p>

      <GraficoBenchmark matriz={matriz} />

      <table className={estilos.tabla}>
        <thead>
          <tr>
            <th scope="col">Perfil</th>
            {ORDEN_CLASES.map((clase) => (
              <th key={clase} scope="col" className={estilos.num} title={NOMBRE_CLASE[clase]}>
                {NOMBRE_CLASE_CORTO[clase]}
              </th>
            ))}
            <th scope="col" className={estilos.num}>
              Líneas
            </th>
            <th scope="col">Reglas que actuaron</th>
            <th scope="col" aria-label="Abrir el detalle" />
          </tr>
        </thead>

        {matriz.tickets.map((ticket) => (
          <tbody key={ticket}>
            <tr className={estilos.banda}>
              <th scope="rowgroup" colSpan={ORDEN_CLASES.length + 4}>
                Ticket <b className="mono">{usdTabla(ticket)}</b> USD
              </th>
            </tr>

            {matriz.portafolios
              .filter((p) => p.ticketUsd === ticket)
              .map((p) => {
                const esta = clave(p)
                const abierto = abierta === esta

                return (
                  <Fragmento key={esta}>
                    <tr className={abierto ? estilos.filaAbierta : ''}>
                      <td className={estilos.perfil}>{p.perfil}</td>

                      {ORDEN_CLASES.map((clase) => {
                        const usd = p.porClase[clase]
                        const share = p.totalUsd > 0 ? usd / p.totalUsd : 0
                        return (
                          <td
                            key={clase}
                            className={`${estilos.num} ${usd <= 0 ? estilos.cero : ''}`}
                            title={usd > 0 ? usdTabla(usd) : 'sin asignación'}
                          >
                            {usd > 0 ? pct1(share) : '—'}
                          </td>
                        )
                      })}

                      <td className={`${estilos.num} mono`}>{p.lineas.length}</td>
                      <td className={estilos.avisos}>
                        {p.avisos.length === 0 ? (
                          <span className={estilos.cero}>ninguna</span>
                        ) : (
                          <span className={estilos.marca}>
                            {plural(p.avisos.length, 'regla', 'reglas')}
                          </span>
                        )}
                      </td>
                      <td>
                        <button
                          type="button"
                          className={estilos.chevron}
                          aria-expanded={abierto}
                          aria-label={`${abierto ? 'Cerrar' : 'Abrir'} el detalle de ${p.perfil} con ticket ${usdCorto(ticket)}`}
                          onClick={() => setAbierta(abierto ? null : esta)}
                        >
                          <svg
                            width="11"
                            height="11"
                            viewBox="0 0 12 12"
                            fill="none"
                            stroke="currentColor"
                            strokeWidth="1.6"
                            strokeLinecap="round"
                            strokeLinejoin="round"
                            className={abierto ? estilos.giro : undefined}
                          >
                            <path d="M2.5 4.5L6 8l3.5-3.5" />
                          </svg>
                        </button>
                      </td>
                    </tr>

                    {abierto && (
                      <tr>
                        <td colSpan={ORDEN_CLASES.length + 4} className={estilos.detalle}>
                          <Detalle portafolio={p} />
                        </td>
                      </tr>
                    )}
                  </Fragmento>
                )
              })}
          </tbody>
        ))}
      </table>
    </div>
  )
}

function Detalle({ portafolio }: { readonly portafolio: Portafolio }) {
  return (
    <div className={estilos.columnas}>
      <div>
        <h3 className={estilos.subtitulo}>Instrumentos</h3>
        {portafolio.lineas.length === 0 ? (
          <p className={estilos.cero}>El modelo no abre ninguna línea con este ticket.</p>
        ) : (
          <ul className={estilos.lineas}>
            {portafolio.lineas.map((linea) => (
              <li key={`${linea.clase}-${linea.instrumento}`}>
                <span
                  className={`${estilos.punto} ${estilos[`punto_${linea.clase}`] ?? ''}`}
                  aria-hidden="true"
                />
                <span className={estilos.instrumento}>{linea.instrumento}</span>
                <span className={`mono ${estilos.montoLinea}`}>{usdTabla(linea.usd)}</span>
                <span className={estilos.shareLinea}>{pct1(linea.share)}</span>
              </li>
            ))}
          </ul>
        )}
      </div>

      <div>
        <h3 className={estilos.subtitulo}>Qué decidió el motor</h3>
        {portafolio.avisos.length === 0 ? (
          <p className={estilos.cero}>Ninguna regla especial actuó en esta corrida.</p>
        ) : (
          <ul className={estilos.reglasLista}>
            {portafolio.avisos.map((aviso) => (
              <li key={aviso}>{aviso}</li>
            ))}
          </ul>
        )}
      </div>
    </div>
  )
}

/** Un `<tr>` y su detalle son hermanos: no pueden ir envueltos en un `<div>`. */
function Fragmento({ children }: { readonly children: React.ReactNode }) {
  return <>{children}</>
}
