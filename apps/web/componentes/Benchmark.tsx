import type { Matriz, Portafolio } from '../lib/benchmark'
import { pct1, plural, usdCentavos, usdTabla } from '../lib/formato'
import { bandaPerfil } from '../lib/perfiles'
import { GraficoBenchmark } from './GraficoBenchmark'
import { SelectorPerfiles } from './SelectorPerfiles'
import estilos from './Benchmark.module.css'

/**
 * El universo del motor, ticket por ticket y perfil por perfil.
 *
 * No es la propuesta de nadie: es la macro corrida en vacío, sin ficha y sin
 * posiciones conservadas. Sirve para mirar las reglas de frente — qué clases
 * abren, cuáles no llegan a su mínimo y a dónde va lo que no llega — y para
 * ver de un vistazo qué cambia cuando la mesa toca los pesos.
 *
 * Sale en cuatro columnas verticales, una por monto, con las clases y sus
 * instrumentos dentro: es la forma del Excel con el que la mesa venía
 * trabajando, y no es una copia por nostalgia. Un porcentaje por clase no dice
 * si Renta Fija entró con cinco ETFs o con un Flip, y esa es exactamente la
 * diferencia que hay que ver cuando el ticket es chico. Los montos van al
 * centavo por lo mismo: el número que hay que poder cotejar contra la hoja.
 *
 * Las cuatro columnas se leen juntas a propósito. Una propuesta se mira de a
 * una; un modelo se juzga por lo que hace en todo su rango, y sobre todo por
 * lo que hace en los bordes.
 */
export function Benchmark({
  matriz,
  problemaDeMacro,
}: {
  readonly matriz: Matriz
  readonly problemaDeMacro: string | null
}) {
  return (
    <div className={estilos.hoja}>
      <header className={estilos.cabecera}>
        <p className="eyebrow">Benchmark</p>
        <h1>Los {matriz.portafolios.length} portafolios del modelo</h1>
        <p className={estilos.bajada}>
          El motor corrido en vacío: {plural(matriz.tickets.length, 'monto', 'montos')} contra{' '}
          {plural(matriz.perfiles.length, 'perfil', 'perfiles')}, sin ficha y sin nada
          conservado. Es lo que el modelo propone a un cliente que llega con dinero y nada más,
          con la{' '}
          {matriz.esDeFabrica ? (
            <>macro de fábrica</>
          ) : (
            <>
              macro <b>v{matriz.versionMacro}</b>
            </>
          )}
          . <a href="/macro">Ver o cambiar la macro</a>
        </p>
      </header>

      {problemaDeMacro !== null && <p className={estilos.problema}>{problemaDeMacro}</p>}

      <form className={estilos.reglas} method="get">
        <p className={estilos.tituloReglas}>Reglas del portafolio</p>

        {/*
          El selector de perfiles se corre solo y no pasa por este `submit`: es
          un cliente con su propia navegación. Va adentro del bloque igual
          porque conceptualmente es una regla más de lo que se está mirando.
        */}
        <SelectorPerfiles elegidos={matriz.perfiles} />

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

        {!matriz.esLaMacroGuardada && (
          <p className={estilos.desviada}>
            Estas no son las reglas de la macro guardada. Lo que ves acá no es lo que la
            propuesta le entrega hoy a un cliente. <a href="/benchmark">Volver a las de la macro</a>{' '}
            ·{' '}
            <a
              href={`/macro?etf=${matriz.reglas.ticketEtfUsd}&umbral=${matriz.reglas.umbralInmobiliarioUsd}&inm=${matriz.reglas.inmobiliario}`}
            >
              llevarlas a la macro
            </a>
          </p>
        )}
      </form>

      <p className={estilos.nota}>
        La diferencia entre las dos reglas del inmobiliario es la que separa las dos hojas con
        las que la mesa venía trabajando. Sobre un perfil Moderado, prorratear le da{' '}
        <b>{pct1(0.2585)}</b> a Renta Fija; mandarlo al bloque alternativo le deja{' '}
        <b>{pct1(0.1899)}</b>. Casi siete puntos, con el mismo benchmark y el mismo ticket.
      </p>

      <GraficoBenchmark matriz={matriz} />

      <div className={estilos.columnas} data-columnas={matriz.tickets.length}>
        {matriz.tickets.map((ticket) => (
          <section key={ticket} className={estilos.columna}>
            <h2 className={estilos.banda}>
              Monto: <span className="mono">{usdTabla(ticket)}</span> dólares
            </h2>

            {matriz.perfiles.map((perfil) => {
              const portafolio = matriz.portafolios.find(
                (p) => p.ticketUsd === ticket && p.perfil === perfil,
              )
              return portafolio === undefined ? null : (
                <TarjetaPerfil key={perfil} portafolio={portafolio} />
              )
            })}
          </section>
        ))}
      </div>
    </div>
  )
}

/**
 * Un portafolio: sus clases, y dentro de cada una sus instrumentos.
 *
 * La clase va en negrita con su total y su peso; los instrumentos, debajo y en
 * tinta más suave. Es la jerarquía de la hoja: la clase es la decisión del
 * benchmark y el instrumento es cómo se ejecuta, y verlos al mismo peso
 * visual haría creer que son lo mismo.
 */
function TarjetaPerfil({ portafolio }: { readonly portafolio: Portafolio }) {
  return (
    <figure className={estilos.tarjeta}>
      <table className={estilos.tabla}>
        <thead>
          <tr style={{ background: bandaPerfil(portafolio.perfil) }}>
            <th scope="col">Clase de Activo</th>
            <th scope="col" className={estilos.num}>
              {portafolio.perfil}
            </th>
            <th scope="col" className={estilos.num}>
              %
            </th>
          </tr>
        </thead>

        <tbody>
          {portafolio.bloques.length === 0 ? (
            <tr>
              <td colSpan={3} className={estilos.vacio}>
                El modelo no abre ninguna línea con este monto.
              </td>
            </tr>
          ) : (
            portafolio.bloques.map((bloque) => (
              <Fragmento key={bloque.clase}>
                <tr className={estilos.filaClase}>
                  <th scope="rowgroup">{bloque.nombre}</th>
                  <td className={`${estilos.num} mono`}>{usdCentavos(bloque.usd)}</td>
                  <td className={estilos.num}>{pct1(bloque.share)}</td>
                </tr>

                {bloque.instrumentos.map((linea) => (
                  <tr key={`${bloque.clase}-${linea.instrumento}`} className={estilos.filaLinea}>
                    <td title={linea.nota ?? undefined}>
                      {linea.instrumento}
                      {linea.nota !== null && (
                        <span className={estilos.asterisco} aria-hidden="true">
                          {' '}
                          *
                        </span>
                      )}
                    </td>
                    <td className={`${estilos.num} mono`}>{usdCentavos(linea.usd)}</td>
                    <td className={estilos.num}>{pct1(linea.share)}</td>
                  </tr>
                ))}
              </Fragmento>
            ))
          )}
        </tbody>

        <tfoot>
          <tr>
            <th scope="row">Total del Portafolio</th>
            <td className={`${estilos.num} mono`}>{usdCentavos(portafolio.totalUsd)}</td>
            <td className={estilos.num}>{pct1(portafolio.totalUsd > 0 ? 1 : 0)}</td>
          </tr>
        </tfoot>
      </table>

      {/*
        Lo que el motor decidió por su cuenta. Va plegado porque en la mayoría
        de las corridas no hay nada que decir, y abierto ocuparía más alto que
        el portafolio mismo. Cuando hay algo, es lo primero que hay que leer:
        una clase que no llegó a su mínimo explica una fila que no está.
      */}
      {portafolio.avisos.length > 0 && (
        <details className={estilos.avisos}>
          <summary>{plural(portafolio.avisos.length, 'regla actuó', 'reglas actuaron')}</summary>
          <ul>
            {portafolio.avisos.map((aviso) => (
              <li key={aviso}>{aviso}</li>
            ))}
          </ul>
        </details>
      )}
    </figure>
  )
}

/** Las filas de una clase y sus instrumentos son hermanas: no van en un `div`. */
function Fragmento({ children }: { readonly children: React.ReactNode }) {
  return <>{children}</>
}
