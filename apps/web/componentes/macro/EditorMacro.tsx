'use client'

import type { Macro } from '@sabbi/config'
import {
  CAMPOS_DE_MACRO,
  NOMBRE_CLASE,
  PERFILES,
  textoDeMacro,
  valorDeMacro,
} from '@sabbi/core'
import type { CampoDeMacro } from '@sabbi/core'
import { useMemo, useState, useTransition } from 'react'

import { guardarMacroAction } from '../../app/macro/acciones'
// El mismo orden de bloques que usa la hoja Allocation detallado y que la
// matriz del benchmark imprime. Dos ordenes distintos para las mismas siete
// clases obligan a buscar cada fila dos veces.
import { ORDEN_CLASES } from '../../lib/clases'
import { pct1 } from '../../lib/formato'
import type { VersionDeMacro } from '../../lib/macro-edicion'
import {
  conRegla,
  conPesoDeClase,
  conTexto,
  cuadrarPerfil,
  cuadrarTodoElReparto,
  descuadres,
  pesoDeClase,
  sumaDelPerfil,
} from '../../lib/macro-edicion'
import { bandaPerfil } from '../../lib/perfiles'
import { CampoNumero } from '../CampoNumero'
import estilos from './Macro.module.css'

/**
 * La macro del portafolio, editable.
 *
 * Es la respuesta completa a «100 mil, moderado»: los pesos que dicen cuánto
 * le toca a cada clase y los umbrales que convierten ese reparto en líneas
 * ejecutables. No hay una segunda copia de estos números en ningún lado — ni
 * en la propuesta, ni en el benchmark, ni en los dos decks —, así que guardar
 * acá cambia todo lo que se calcule después.
 *
 * Todo lo que se muestra se puede editar. Una pantalla que mezcla lo editable
 * con lo que solo se lee obliga a probar cada celda para saber cuál es cuál;
 * acá lo que aparece se toca, y lo que no se puede tocar no aparece.
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

/** Lo que se muestra al lado de un campo para volver a lo de fábrica. */
const enUnidad = (campo: CampoDeMacro, macro: Macro): string =>
  campo.unidad === 'usd'
    ? valorDeMacro(macro.reglas, campo.ruta).toLocaleString('en-US')
    : campo.unidad === 'pct'
      ? `${aPct(valorDeMacro(macro.reglas, campo.ruta))}%`
      : etiquetaDeOpcion(campo, textoDeMacro(macro.reglas, campo.ruta))

const etiquetaDeOpcion = (campo: CampoDeMacro, valor: string): string =>
  campo.opciones?.find((o) => o.valor === valor)?.etiqueta ?? valor

export function EditorMacro(props: Props) {
  const { guardada, deFabrica, historial } = props

  const [macro, setMacro] = useState<Macro>(() => conLasPropuestas(guardada, props.propuestas))
  const [tocados, setTocados] = useState<ReadonlySet<string>>(
    () => new Set(Object.keys(props.propuestas).length > 0 ? ['reglas'] : []),
  )
  const [nota, setNota] = useState('')
  const [busqueda, setBusqueda] = useState('')
  const [resultado, setResultado] = useState<string | null>(null)
  const [errores, setErrores] = useState<readonly string[]>([])
  const [guardando, empezar] = useTransition()

  const marcar = (llave: string) => setTocados((previos) => new Set(previos).add(llave))

  const cambiado = useMemo(
    () => JSON.stringify(macro) !== JSON.stringify(guardada),
    [macro, guardada],
  )
  const fuera = useMemo(() => descuadres(macro, PERFILES), [macro])

  // Los descuadres del reparto interno de una clase no tienen celda propia en
  // esta pantalla —los instrumentos se mueven solos, con su clase—, así que
  // tiene que haber un botón que los cierre. Sin él, una macro que llegara
  // torcida de la base dejaría el guardado bloqueado sin salida. Los del
  // perfil sí tienen su «cuadrar» en el pie de la tabla, y se reconocen porque
  // `donde` es el perfil entero.
  const hayDescuadreDeReparto = fuera.some(
    (d) => !(PERFILES as readonly string[]).includes(d.donde),
  )

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

  const filtro = busqueda.trim().toLowerCase()
  const bloques = useMemo(() => agrupar(CAMPOS_DE_MACRO, filtro), [filtro])

  return (
    <div className={estilos.hoja}>
      <header className={estilos.cabecera}>
        <p className="eyebrow">Macro</p>
        <h1>Las reglas con las que sale un portafolio</h1>
        <p className={estilos.bajada}>
          Todo lo que decide qué recibe un cliente que llega con un monto y un perfil: los pesos
          del benchmark y los umbrales del motor. Es la única fuente — la propuesta, la matriz del{' '}
          <a href="/benchmark">benchmark</a> y los dos decks corren el mismo motor con esto y no
          tienen otra. Guardar una versión nueva cambia todo lo que se calcule después, y la
          anterior queda entera por si hay que volver.
        </p>
        <p className={estilos.procedencia}>
          {props.esDeFabrica ? (
            <>
              Corriendo la <b>macro de fábrica</b>: los pesos y las reglas de la{' '}
              <i>Benchmark Sabbi</i> v4. Todavía nadie guardó una en esta base.
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

      {/*
        La barra de guardado se pega arriba. Los pesos son treinta y cinco
        celdas y los umbrales veinticinco: sin ella, cambiar el último obliga a
        volver hasta el principio para que el cambio exista.
      */}
      <div className={estilos.barra} data-cambiado={cambiado ? '' : undefined}>
        <span className={estilos.estado}>
          {cambiado
            ? `${tocados.size || 1} cambio${tocados.size === 1 ? '' : 's'} sin guardar`
            : 'Sin cambios'}
        </span>

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
            fuera.length > 0 ? 'Hay pesos que no cuadran. Cuadralos antes de guardar.' : undefined
          }
        >
          {guardando ? 'Guardando…' : 'Guardar y activar'}
        </button>

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

        <button
          type="button"
          className="secundario"
          onClick={() => {
            setMacro({ ...deFabrica, version: macro.version })
            setTocados(new Set(['fabrica']))
          }}
          title="Trae los pesos y las reglas de la Benchmark Sabbi v4. No guarda: hay que revisarlos y guardar."
        >
          Cargar la de fábrica
        </button>
      </div>

      {fuera.length > 0 && (
        <div className={estilos.descuadres}>
          <ul>
            {fuera.map((d) => (
              <li key={d.donde}>
                <b>{d.donde}</b> suma {pct1(d.suma)} y tiene que sumar 100%.
              </li>
            ))}
          </ul>
          {hayDescuadreDeReparto && (
            <button
              type="button"
              className={estilos.cuadrar}
              onClick={() => {
                setMacro((m) => cuadrarTodoElReparto(m, PERFILES))
                marcar('reparto')
              }}
            >
              cuadrar los instrumentos
            </button>
          )}
        </div>
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
          entre las clases que no tocaste, conservando sus proporciones. Los instrumentos de una
          clase se mueven con ella: subirla no cambia qué parte se lleva cada uno, cambia cuánto
          es esa parte.
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
                      <CampoNumero
                        className={`mono ${estilos.entrada} ${
                          tocados.has(llave) ? estilos.tocada : ''
                        }`}
                        aria-label={`${NOMBRE_CLASE[clase]} en ${perfil}`}
                        texto={aPct(pesoDeClase(macro, clase, perfil))}
                        alCambiar={(pct) => {
                          if (pct === null) return
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
                    {!cuadra && (
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

      {/* ── Los umbrales ──────────────────────────────────────────────── */}

      <section className={estilos.bloque}>
        <div className={estilos.tituloConFiltro}>
          <div>
            <h2>Los umbrales del motor</h2>
            <p className={estilos.explica}>
              Lo que convierte un reparto en líneas que se pueden ejecutar, en el orden en que el
              motor las aplica: primero el ticket que decide si una línea existe, después los dos
              motores que reparten mercados públicos, después las clases que se abren o no por su
              mínimo, y al final dónde cae lo que no llegó.
            </p>
          </div>
          <input
            className={estilos.buscador}
            value={busqueda}
            onChange={(e) => setBusqueda(e.target.value)}
            placeholder="Buscar un umbral…"
            aria-label="Buscar un umbral"
            type="search"
          />
        </div>

        {bloques.length === 0 && (
          <p className={estilos.explica}>Ningún umbral coincide con «{busqueda}».</p>
        )}

        <div className={estilos.grupos}>
          {bloques.map(([nombre, campos]) => {
            const cuantos = campos.filter((c) => tocados.has(clave('regla', c.ruta))).length
            return (
              <div key={nombre} className={estilos.grupo}>
                <h3>
                  {nombre}
                  {cuantos > 0 && <span className={estilos.contador}>{cuantos}</span>}
                </h3>
                {campos.map((campo) => (
                  <Campo
                    key={campo.ruta}
                    campo={campo}
                    macro={macro}
                    deFabrica={deFabrica}
                    tocado={tocados.has(clave('regla', campo.ruta))}
                    alCambiar={(siguiente) => {
                      marcar(clave('regla', campo.ruta))
                      setMacro(siguiente)
                    }}
                  />
                ))}
              </div>
            )
          })}
        </div>
      </section>

      {historial.length > 0 && (
        <section className={estilos.bloque}>
          <h2>Las versiones anteriores</h2>
          <p className={estilos.explica}>
            Ninguna se sobreescribe. Una cifra que salió en la propuesta de un cliente se explica
            por la macro con la que se calculó, y esa explicación tiene que seguir estando. Es
            también lo que hace seguro que cualquiera de la mesa edite: volver es guardar otra vez.
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

/**
 * Un umbral del motor, con la forma que le corresponde a su unidad.
 *
 * Los porcentajes traen deslizador porque son fracciones acotadas y lo que se
 * busca en ellos es un tanteo: mover el sacrificio máximo del 20% al 35% y ver
 * qué pasa. Los dólares traen botones de paso porque lo que se busca es un
 * número redondo, y teclear cinco ceros para probar es lo que hace que nadie
 * pruebe. Las opciones son un desplegable, y el núcleo un texto.
 *
 * Todos muestran de dónde vienen: al lado de un valor que se apartó de la
 * fábrica está el de fábrica y un botón para volver solo ese campo. Descartar
 * todo cuando se quiere deshacer un número es lo que hace que se prefiera no
 * tocarlo.
 */
function Campo({
  campo,
  macro,
  deFabrica,
  tocado,
  alCambiar,
}: {
  readonly campo: CampoDeMacro
  readonly macro: Macro
  readonly deFabrica: Macro
  readonly tocado: boolean
  readonly alCambiar: (siguiente: (m: Macro) => Macro) => void
}) {
  const esNumero = campo.unidad === 'usd' || campo.unidad === 'pct'
  const valor = valorDeMacro(macro.reglas, campo.ruta)
  const texto = textoDeMacro(macro.reglas, campo.ruta)

  const igualAFabrica = esNumero
    ? valor === valorDeMacro(deFabrica.reglas, campo.ruta)
    : texto === textoDeMacro(deFabrica.reglas, campo.ruta)

  const escribirNumero = (nuevo: number) =>
    alCambiar((m) => conRegla(m, campo.ruta, nuevo))
  const escribirTexto = (nuevo: string) => alCambiar((m) => conTexto(m, campo.ruta, nuevo))

  const paso = campo.rango?.paso ?? (campo.unidad === 'pct' ? 0.05 : 1_000)

  return (
    // Un <div> y no un <label>: adentro hay botones de paso y uno de volver, y
    // un control dentro de una etiqueta que apunta a otro control es un clic
    // que hace dos cosas. Cada control lleva su propio `aria-label`.
    <div className={estilos.campoAncho}>
      <span>
        {campo.etiqueta}
        <em className={estilos.unidad}>
          {campo.unidad === 'usd' ? 'USD' : campo.unidad === 'pct' ? '%' : ''}
        </em>
      </span>

      {esNumero ? (
        <div className={estilos.fila}>
          <button
            type="button"
            className={estilos.paso}
            aria-label={`Bajar ${campo.etiqueta}`}
            onClick={() => escribirNumero(redondear(valor - paso, campo))}
          >
            −
          </button>
          <CampoNumero
            className={`mono ${estilos.entrada} ${tocado ? estilos.tocada : ''}`}
            aria-label={campo.etiqueta}
            texto={campo.unidad === 'usd' ? String(valor) : aPct(valor)}
            alCambiar={(nuevo) => {
              if (nuevo === null) return
              escribirNumero(campo.unidad === 'usd' ? nuevo : nuevo / 100)
            }}
          />
          <button
            type="button"
            className={estilos.paso}
            aria-label={`Subir ${campo.etiqueta}`}
            onClick={() => escribirNumero(redondear(valor + paso, campo))}
          >
            +
          </button>
        </div>
      ) : campo.unidad === 'opcion' ? (
        <select
          value={texto}
          className={tocado ? estilos.tocada : undefined}
          onChange={(e) => escribirTexto(e.target.value)}
          aria-label={campo.etiqueta}
        >
          {(campo.opciones ?? []).map((opcion) => (
            <option key={opcion.valor} value={opcion.valor}>
              {opcion.etiqueta}
            </option>
          ))}
        </select>
      ) : (
        <input
          className={`${estilos.entradaTexto} ${tocado ? estilos.tocada : ''}`}
          value={texto}
          onChange={(e) => escribirTexto(e.target.value)}
          aria-label={campo.etiqueta}
        />
      )}

      {/* El deslizador solo para fracciones: es donde el rango es conocido y
          el gesto que se quiere es tantear, no teclear un valor exacto. */}
      {campo.unidad === 'pct' && (
        <input
          type="range"
          className={estilos.deslizador}
          min={campo.rango?.min ?? 0}
          max={campo.rango?.max ?? 1}
          step={paso}
          value={Math.min(Math.max(valor, campo.rango?.min ?? 0), campo.rango?.max ?? 1)}
          onChange={(e) => escribirNumero(redondear(Number(e.target.value), campo))}
          aria-label={`${campo.etiqueta}, deslizador`}
        />
      )}

      <small>
        {campo.explica}
        {campo.ceroEs !== undefined && (
          <>
            {' '}
            <b>En cero: {campo.ceroEs}.</b>
          </>
        )}
      </small>

      {!igualAFabrica && (
        <small className={estilos.fabrica}>
          De fábrica: {enUnidad(campo, deFabrica)}
          <button
            type="button"
            className={estilos.cuadrar}
            onClick={() =>
              esNumero
                ? escribirNumero(valorDeMacro(deFabrica.reglas, campo.ruta))
                : escribirTexto(textoDeMacro(deFabrica.reglas, campo.ruta))
            }
          >
            volver
          </button>
        </small>
      )}
    </div>
  )
}

/**
 * Redondea al paso del campo y lo deja dentro de su rango.
 *
 * Sumar 0.05 sobre 0.15 en coma flotante da 0.19999999999999998, y ese número
 * es el que se guardaría. Un umbral que dice 20% y guarda 19.999999998% no es
 * un error de cálculo, pero es un número que nadie escribió.
 *
 * El rango solo acota a los botones y al deslizador, que son gestos de tanteo.
 * Quien necesite un valor fuera de él lo teclea en la celda y decide el
 * esquema, que es la única validación que corre también fuera de esta pantalla.
 */
function redondear(valor: number, campo: CampoDeMacro): number {
  const paso = campo.rango?.paso ?? (campo.unidad === 'pct' ? 0.05 : 1_000)
  const decimales = campo.unidad === 'pct' ? 6 : 2
  const redondeado = Number((Math.round(valor / paso) * paso).toFixed(decimales))

  const min = campo.rango?.min ?? 0
  const max = campo.rango?.max ?? Number.POSITIVE_INFINITY
  return Math.min(Math.max(redondeado, min), max)
}

/**
 * Los campos agrupados en el orden en que están declarados, con el filtro
 * puesto.
 *
 * El orden viene del motor y no de acá a propósito: la lista de `CAMPOS_DE_MACRO`
 * está escrita en el orden en que el motor aplica sus reglas, y reordenarla en
 * la pantalla sería tener dos ideas distintas del mismo recorrido.
 */
function agrupar(
  campos: typeof CAMPOS_DE_MACRO,
  filtro: string,
): readonly (readonly [string, typeof CAMPOS_DE_MACRO])[] {
  const orden: string[] = []
  const mapa = new Map<string, CampoDeMacro[]>()

  for (const campo of campos) {
    if (filtro !== '' && !coincide(campo, filtro)) continue
    if (!mapa.has(campo.grupo)) {
      mapa.set(campo.grupo, [])
      orden.push(campo.grupo)
    }
    mapa.get(campo.grupo)?.push(campo)
  }

  return orden.map((nombre) => [nombre, mapa.get(nombre) ?? []] as const)
}

/** Se busca por lo que se recuerda: el nombre, el grupo o lo que decide. */
const coincide = (campo: CampoDeMacro, filtro: string): boolean =>
  `${campo.etiqueta} ${campo.grupo} ${campo.explica} ${campo.ruta}`
    .toLowerCase()
    .includes(filtro)

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
  // Solo los destinos que el motor conoce. Uno inventado dejaria la macro con
  // un valor que el esquema rechaza al guardar, y el mensaje llegaria despues
  // de teclear la nota.
  const inm = propuestas['inm']
  if (inm === 'alternativos' || inm === 'prorratear' || inm === 'publicos') {
    macro = conTexto(macro, 'inmobiliario.destino', inm)
  }

  return macro
}

const fecha = (iso: string): string =>
  new Date(iso).toLocaleDateString('es-PE', { day: '2-digit', month: 'short', year: 'numeric' })
