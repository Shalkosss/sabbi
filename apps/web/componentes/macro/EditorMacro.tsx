'use client'

import type { Macro } from '@sabbi/config'
import { CAMPOS_DE_MACRO, NOMBRE_CLASE, PERFILES, valorDeMacro } from '@sabbi/core'
import { useMemo, useState, useTransition } from 'react'

import { guardarMacroAction } from '../../app/macro/acciones'
// El mismo orden de bloques que usa la hoja Allocation detallado y que la
// matriz del benchmark imprime. Dos ordenes distintos para las mismas siete
// clases obligan a buscar cada fila dos veces.
import { ORDEN_CLASES } from '../../lib/clases'
import { pct1, plural } from '../../lib/formato'
import type { VersionDeMacro } from '../../lib/macro-edicion'
import {
  conDestinoInmobiliario,
  conPesoDeClase,
  conRegla,
  conRepartoInterno,
  cuadrarPerfil,
  cuadrarReparto,
  descuadres,
  pesoDeClase,
  repartoInterno,
  sumaDelPerfil,
  sumaDelReparto,
} from '../../lib/macro-edicion'
import { bandaPerfil } from '../../lib/perfiles'
import { CampoNumero } from '../CampoNumero'
import estilos from './Macro.module.css'

/**
 * La macro del portafolio, editable.
 *
 * Es la respuesta completa a «100 mil, moderado»: los pesos que dicen cuánto
 * le toca a cada clase y a cada instrumento, y los umbrales que convierten ese
 * reparto en líneas ejecutables. No hay una segunda copia de estos números en
 * ningún lado — ni en la propuesta, ni en el benchmark, ni en los dos decks —,
 * así que guardar acá cambia todo lo que se calcule después.
 *
 * Lo que no se toca no se reescribe. Los pesos de la hoja llegan con dieciséis
 * dígitos y redondearlos a cuatro decimales desplaza la base de redistribución
 * en 6,502.88 USD sobre el caso Ana Tumi; un editor que guardara los treinta y
 * cinco pesos cada vez haría ese redondeo sin que nadie lo pida. Acá cada celda
 * editada se marca y solo esas viajan.
 *
 * Guardar no sobreescribe: escribe una versión nueva y la activa. Una cifra que
 * salió en la propuesta de un cliente real se explica por la macro con la que
 * se calculó, y esa explicación tiene que seguir estando el mes que viene.
 */

interface Props {
  readonly guardada: Macro
  readonly deFabrica: Macro
  readonly puedeEditar: boolean
  readonly esDeFabrica: boolean
  readonly problema: string | null
  readonly guardadaEn: string | null
  readonly guardadaPor: string | null
  readonly historial: readonly VersionDeMacro[]
  /** Reglas que llegan propuestas desde la pantalla de Benchmark. */
  readonly propuestas: Readonly<Record<string, number | string>>
}

/** Fracción a porcentaje editable. Seis decimales alcanzan y no mienten. */
const aPct = (fraccion: number): string => String(Number((fraccion * 100).toFixed(6)))

const clave = (...partes: (string | number)[]) => partes.join('|')

export function EditorMacro(props: Props) {
  const { guardada, deFabrica, puedeEditar, historial } = props

  const [macro, setMacro] = useState<Macro>(() => conLasPropuestas(guardada, props.propuestas))
  const [tocados, setTocados] = useState<ReadonlySet<string>>(
    () => new Set(Object.keys(props.propuestas).length > 0 ? ['reglas'] : []),
  )
  const [nota, setNota] = useState('')
  const [resultado, setResultado] = useState<string | null>(null)
  const [errores, setErrores] = useState<readonly string[]>([])
  const [guardando, empezar] = useTransition()

  const marcar = (llave: string) => setTocados((previos) => new Set(previos).add(llave))

  const cambiado = useMemo(
    () => JSON.stringify(macro) !== JSON.stringify(guardada),
    [macro, guardada],
  )
  const fuera = useMemo(() => descuadres(macro, PERFILES), [macro])

  const guardar = () => {
    setResultado(null)
    setErrores([])
    empezar(async () => {
      const salida = await guardarMacroAction(macro, nota)
      if (salida.ok) {
        setResultado(`Guardada como v${salida.version}. Todo lo que se calcule desde ahora la usa.`)
        setTocados(new Set())
        setNota('')
      } else {
        setErrores(salida.errores)
      }
    })
  }

  return (
    <div className={estilos.hoja}>
      <header className={estilos.cabecera}>
        <p className="eyebrow">Macro</p>
        <h1>Las reglas con las que sale un portafolio</h1>
        <p className={estilos.bajada}>
          Todo lo que decide qué recibe un cliente que llega con un monto y un perfil: los pesos
          del benchmark y los umbrales del motor. Es la única fuente — la propuesta, la matriz del{' '}
          <a href="/benchmark">benchmark</a> y los dos decks corren el mismo motor con esto y no
          tienen otra. Guardar una versión nueva cambia todo lo que se calcule después.
        </p>
        <p className={estilos.procedencia}>
          {props.esDeFabrica ? (
            <>
              Corriendo la <b>macro de fábrica</b>: los pesos de la hoja <i>Data</i> v4 y los
              umbrales de la <i>Benchmark Sabbi</i> v8. Todavía nadie guardó una en esta base.
            </>
          ) : (
            <>
              Corriendo la <b>v{guardada.version}</b>
              {props.guardadaPor === null ? '' : `, guardada por ${props.guardadaPor}`}
              {props.guardadaEn === null ? '' : ` el ${fecha(props.guardadaEn)}`}.
              {guardada.nota === '' ? '' : ` «${guardada.nota}»`}
            </>
          )}
        </p>
      </header>

      {props.problema !== null && <p className={estilos.problema}>{props.problema}</p>}

      {!puedeEditar && (
        <p className={estilos.soloLectura}>
          Estás viendo la macro, no editándola. Tu usuario no tiene ficha de asesor, así que no
          hay a quién atribuirle una versión nueva.
        </p>
      )}

      {/*
        La barra de guardado se pega arriba. Los pesos son treinta y cinco
        celdas y los umbrales trece: sin ella, cambiar el último obliga a
        volver hasta el principio para que el cambio exista.
      */}
      <div className={estilos.barra} data-cambiado={cambiado ? '' : undefined}>
        <span className={estilos.estado}>
          {cambiado ? `${tocados.size || 1} cambio${tocados.size === 1 ? '' : 's'} sin guardar` : 'Sin cambios'}
        </span>

        {puedeEditar && (
          <>
            <input
              className={estilos.nota}
              value={nota}
              onChange={(e) => setNota(e.target.value)}
              placeholder="Por qué se cambia (queda con la versión)"
              aria-label="Nota de la versión"
            />
            <button
              type="button"
              className="primario"
              onClick={guardar}
              disabled={!cambiado || fuera.length > 0 || guardando}
              title={
                fuera.length > 0
                  ? 'Hay pesos que no cuadran. Cuadralos antes de guardar.'
                  : undefined
              }
            >
              {guardando ? 'Guardando…' : 'Guardar y activar'}
            </button>
          </>
        )}

        <button
          type="button"
          className="secundario"
          onClick={() => {
            setMacro(guardada)
            setTocados(new Set())
          }}
          disabled={!cambiado}
        >
          Descartar
        </button>

        {puedeEditar && (
          <button
            type="button"
            className="secundario"
            onClick={() => {
              setMacro({ ...deFabrica, version: macro.version })
              setTocados(new Set(['fabrica']))
            }}
            title="Trae los pesos v4 y los umbrales v8. No guarda: hay que revisarlos y guardar."
          >
            Cargar la de fábrica
          </button>
        )}
      </div>

      {fuera.length > 0 && (
        <ul className={estilos.descuadres}>
          {fuera.map((d) => (
            <li key={d.donde}>
              <b>{d.donde}</b> suma {pct1(d.suma)} y tiene que sumar 100%.
            </li>
          ))}
        </ul>
      )}

      {errores.length > 0 && (
        <ul className={estilos.errores} role="alert">
          {errores.map((error) => (
            <li key={error}>{error}</li>
          ))}
        </ul>
      )}

      {resultado !== null && (
        <p className={estilos.exito} role="status">
          {resultado}
        </p>
      )}

      {/* ── Los pesos ─────────────────────────────────────────────────── */}

      <section className={estilos.bloque}>
        <h2>Cuánto le toca a cada clase</h2>
        <p className={estilos.explica}>
          El reparto del patrimonio antes de cualquier mínimo. Cada columna tiene que sumar 100%:
          si no suma, el motor reparte mal y no lo dice. <b>Cuadrar</b> reparte la diferencia
          entre las clases que no tocaste, conservando sus proporciones.
        </p>

        <table className={estilos.tabla}>
          <thead>
            <tr>
              <th scope="col">Clase</th>
              {PERFILES.map((perfil) => (
                <th
                  key={perfil}
                  scope="col"
                  className={estilos.num}
                  style={{ borderBottomColor: bandaPerfil(perfil) }}
                >
                  {perfil}
                </th>
              ))}
            </tr>
          </thead>

          <tbody>
            {ORDEN_CLASES.map((clase) => (
              <tr key={clase}>
                <th scope="row">{NOMBRE_CLASE[clase]}</th>
                {PERFILES.map((perfil) => {
                  const llave = clave('clase', clase, perfil)
                  return (
                    <td key={perfil} className={estilos.num}>
                      <Celda
                        valor={pesoDeClase(macro, clase, perfil)}
                        tocada={tocados.has(llave)}
                        editable={puedeEditar}
                        etiqueta={`${NOMBRE_CLASE[clase]} en ${perfil}`}
                        alCambiar={(pct) => {
                          marcar(llave)
                          setMacro((m) => conPesoDeClase(m, clase, perfil, pct / 100))
                        }}
                      />
                    </td>
                  )
                })}
              </tr>
            ))}
          </tbody>

          <tfoot>
            <tr>
              <th scope="row">Suma</th>
              {PERFILES.map((perfil) => {
                const suma = sumaDelPerfil(macro, perfil)
                const cuadra = Math.abs(suma - 1) <= 1e-6
                return (
                  <td key={perfil} className={estilos.num}>
                    <span className={cuadra ? estilos.cuadra : estilos.noCuadra}>
                      {pct1(suma)}
                    </span>
                    {!cuadra && puedeEditar && (
                      <button
                        type="button"
                        className={estilos.cuadrar}
                        onClick={() =>
                          setMacro((m) =>
                            cuadrarPerfil(
                              m,
                              perfil,
                              new Set(
                                ORDEN_CLASES.filter((c) => !tocados.has(clave('clase', c, perfil))),
                              ),
                            ),
                          )
                        }
                      >
                        cuadrar
                      </button>
                    )}
                  </td>
                )
              })}
            </tr>
          </tfoot>
        </table>
      </section>

      {/* ── El reparto interno ────────────────────────────────────────── */}

      <section className={estilos.bloque}>
        <h2>Qué instrumentos abre cada clase</h2>
        <p className={estilos.explica}>
          Dentro de una clase, qué parte se lleva cada instrumento. Se edita como reparto interno
          —el 100% es la clase, no el patrimonio— porque así es como se piensa; al guardar se
          multiplica por el peso de la clase, que es como lo guarda la hoja. Subir una clase no
          cambia este reparto: cambia cuánto es.
        </p>

        {ORDEN_CLASES.filter((clase) => macro.pesos.clases[clase].productos.length > 0).map((clase) => (
          <details key={clase} className={estilos.clase}>
            <summary>
              <b>{NOMBRE_CLASE[clase]}</b>{' '}
              <span className={estilos.cuenta}>
                {plural(macro.pesos.clases[clase].productos.length, 'instrumento', 'instrumentos')}
              </span>
            </summary>

            <table className={estilos.tabla}>
              <thead>
                <tr>
                  <th scope="col">Instrumento</th>
                  {PERFILES.map((perfil) => (
                    <th key={perfil} scope="col" className={estilos.num}>
                      {perfil}
                    </th>
                  ))}
                </tr>
              </thead>

              <tbody>
                {macro.pesos.clases[clase].productos.map((producto, indice) => (
                  <tr key={producto.nombre}>
                    <th scope="row" className={estilos.instrumento} title={producto.nombre}>
                      {producto.nombre}
                    </th>
                    {PERFILES.map((perfil) => {
                      const llave = clave('prod', clase, indice, perfil)
                      return (
                        <td key={perfil} className={estilos.num}>
                          <Celda
                            valor={repartoInterno(macro, clase, perfil)[indice] ?? 0}
                            tocada={tocados.has(llave)}
                            editable={puedeEditar}
                            etiqueta={`${producto.nombre} dentro de ${NOMBRE_CLASE[clase]} en ${perfil}`}
                            alCambiar={(pct) => {
                              marcar(llave)
                              setMacro((m) =>
                                conRepartoInterno(m, clase, indice, perfil, pct / 100),
                              )
                            }}
                          />
                        </td>
                      )
                    })}
                  </tr>
                ))}
              </tbody>

              <tfoot>
                <tr>
                  <th scope="row">Suma</th>
                  {PERFILES.map((perfil) => {
                    const suma = sumaDelReparto(macro, clase, perfil)
                    const vacia = pesoDeClase(macro, clase, perfil) <= 1e-12
                    const cuadra = vacia || Math.abs(suma - 1) <= 1e-9
                    return (
                      <td key={perfil} className={estilos.num}>
                        {vacia ? (
                          <span className={estilos.apagado} title="La clase no recibe nada en este perfil">
                            —
                          </span>
                        ) : (
                          <span className={cuadra ? estilos.cuadra : estilos.noCuadra}>
                            {pct1(suma)}
                          </span>
                        )}
                        {!cuadra && puedeEditar && (
                          <button
                            type="button"
                            className={estilos.cuadrar}
                            onClick={() => setMacro((m) => cuadrarReparto(m, clase, perfil))}
                          >
                            cuadrar
                          </button>
                        )}
                      </td>
                    )
                  })}
                </tr>
              </tfoot>
            </table>
          </details>
        ))}
      </section>

      {/* ── Los umbrales ──────────────────────────────────────────────── */}

      <section className={estilos.bloque}>
        <h2>Los umbrales del motor</h2>
        <p className={estilos.explica}>
          Lo que convierte un reparto en líneas que se pueden ejecutar. Son los números que
          deciden qué clase abre, qué instrumento no llega y a dónde va el dinero que sobra.
        </p>

        <div className={estilos.grupos}>
          <div className={estilos.grupo}>
            <h3>Inmobiliario Directo</h3>
            <label className={estilos.campoAncho}>
              <span>Cuando la clase se disuelve, su capital</span>
              <select
                value={macro.reglas.inmobiliario.destino}
                disabled={!puedeEditar}
                onChange={(e) => {
                  marcar('destino')
                  setMacro((m) =>
                    conDestinoInmobiliario(
                      m,
                      e.target.value === 'alternativos' ? 'alternativos' : 'prorratear',
                    ),
                  )
                }}
              >
                <option value="prorratear">se prorratea entre las cinco clases</option>
                <option value="alternativos">pasa entero a Privados, Club y Otros</option>
              </select>
              <small>
                Es la regla en la que difieren las dos hojas con las que la mesa venía trabajando.
                Sobre un Moderado la diferencia son casi siete puntos en Renta Fija.
              </small>
            </label>
          </div>

          {grupos(CAMPOS_DE_MACRO).map(([nombre, campos]) => (
            <div key={nombre} className={estilos.grupo}>
              <h3>{nombre}</h3>
              {campos.map((campo) => {
                const valor = valorDeMacro(macro.reglas, campo.ruta)
                const llave = clave('regla', campo.ruta)
                return (
                  <label key={campo.ruta} className={estilos.campoAncho}>
                    <span>
                      {campo.etiqueta}
                      <em className={estilos.unidad}>{campo.unidad === 'usd' ? 'USD' : '%'}</em>
                    </span>
                    <CampoNumero
                      className={`mono ${estilos.entrada} ${tocados.has(llave) ? estilos.tocada : ''}`}
                      aria-label={campo.etiqueta}
                      texto={campo.unidad === 'usd' ? String(valor) : aPct(valor)}
                      alCambiar={(nuevo) => {
                        if (nuevo === null) return
                        marcar(llave)
                        setMacro((m) =>
                          conRegla(m, campo.ruta, campo.unidad === 'usd' ? nuevo : nuevo / 100),
                        )
                      }}
                    />
                    <small>{campo.explica}</small>
                  </label>
                )
              })}
            </div>
          ))}
        </div>
      </section>

      {historial.length > 0 && (
        <section className={estilos.bloque}>
          <h2>Las versiones anteriores</h2>
          <p className={estilos.explica}>
            Ninguna se sobreescribe. Una cifra que salió en la propuesta de un cliente se explica
            por la macro con la que se calculó, y esa explicación tiene que seguir estando.
          </p>
          <ul className={estilos.historial}>
            {historial.map((version) => (
              <li key={version.version}>
                <b>v{version.version}</b>
                {version.activa && <span className={estilos.activa}>activa</span>}
                <span className={estilos.cuando}>{fecha(version.creadaEn)}</span>
                {version.autor !== null && <span className={estilos.autor}>{version.autor}</span>}
                {version.nota !== '' && <span className={estilos.porQue}>{version.nota}</span>}
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  )
}

/** Una celda de peso: porcentaje editable, marcada si se tocó. */
function Celda({
  valor,
  tocada,
  editable,
  etiqueta,
  alCambiar,
}: {
  readonly valor: number
  readonly tocada: boolean
  readonly editable: boolean
  readonly etiqueta: string
  readonly alCambiar: (pct: number) => void
}) {
  if (!editable) return <span className="mono">{aPct(valor)}%</span>

  return (
    <CampoNumero
      className={`mono ${estilos.entrada} ${tocada ? estilos.tocada : ''}`}
      aria-label={etiqueta}
      texto={aPct(valor)}
      alCambiar={(nuevo) => {
        if (nuevo === null) return
        alCambiar(nuevo)
      }}
    />
  )
}

/** Los campos de la macro, agrupados en el orden en que están declarados. */
function grupos(
  campos: typeof CAMPOS_DE_MACRO,
): readonly (readonly [string, typeof CAMPOS_DE_MACRO])[] {
  const orden: string[] = []
  const mapa = new Map<string, (typeof CAMPOS_DE_MACRO)[number][]>()

  for (const campo of campos) {
    // El bloque del inmobiliario ya salió arriba con su desplegable.
    if (campo.grupo === 'Inmobiliario Directo') continue
    if (!mapa.has(campo.grupo)) {
      mapa.set(campo.grupo, [])
      orden.push(campo.grupo)
    }
    mapa.get(campo.grupo)?.push(campo)
  }

  return orden.map((nombre) => [nombre, mapa.get(nombre) ?? []] as const)
}

/**
 * Las tres palancas que llegan desde la pantalla de Benchmark.
 *
 * Ahí se prueban sin guardar nada; el enlace «llevarlas a la macro» las trae
 * puestas para que el paso de probar a fijar sea uno solo. Llegan por la URL,
 * así que se validan como cualquier otra entrada de afuera.
 */
function conLasPropuestas(base: Macro, propuestas: Props['propuestas']): Macro {
  const numero = (clave: string) => {
    const valor = Number(propuestas[clave])
    return Number.isFinite(valor) && valor > 0 ? valor : null
  }

  let macro = base
  const etf = numero('etf')
  if (etf !== null) macro = conRegla(macro, 'ticketEtfUsd', etf)
  const umbral = numero('umbral')
  if (umbral !== null) macro = conRegla(macro, 'inmobiliario.umbralUsd', umbral)
  if (propuestas['inm'] === 'alternativos') macro = conDestinoInmobiliario(macro, 'alternativos')
  if (propuestas['inm'] === 'prorratear') macro = conDestinoInmobiliario(macro, 'prorratear')

  return macro
}

const fecha = (iso: string): string =>
  new Date(iso).toLocaleDateString('es-PE', { day: '2-digit', month: 'short', year: 'numeric' })
