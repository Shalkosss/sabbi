'use client'

import { useMemo, useState } from 'react'

import { MESES_SIN_ANUALIZAR, VENTANAS, VENTANAS_CON_RIESGO, crecimiento } from '@sabbi/core'
import type { MetricaAnual, MetricasFondo, MetricaVentana, ObservacionMensual } from '@sabbi/core'

import { SIN_DATO, mesLargo, pctFondo, sharpe } from '../../lib/formato'
import { Chispa } from './Chispa'
import { PanelFondo } from './PanelFondo'
import estilos from './TablaFondos.module.css'

/** La serie de un fondo, para la chispa y para el panel de detalle. */
export interface SerieDeFondo {
  readonly fondoId: string
  readonly observaciones: readonly ObservacionMensual[]
}

interface Props {
  readonly metricas: readonly MetricasFondo[]
  readonly series: readonly SerieDeFondo[]
  readonly clases: readonly string[]
  /** El de respaldo. El habitual sale del Treasury del mes de corte de cada fondo. */
  readonly riskFree: number
  readonly sinTreasury: number
}

/** Las columnas ordenables, con de donde sale el numero de cada una. */
type Orden =
  | { readonly tipo: 'nombre' }
  | { readonly tipo: 'clase' }
  | { readonly tipo: 'ventana'; readonly clave: string; readonly campo: keyof MetricaVentana }
  | { readonly tipo: 'anio'; readonly anio: number }

/** Los bloques de columnas que se pueden apagar. */
type Bloque = 'ficha' | 'anios' | 'riesgo'

const BLOQUES: readonly { readonly clave: Bloque; readonly texto: string }[] = [
  { clave: 'ficha', texto: 'Ficha' },
  { clave: 'anios', texto: 'Años' },
  { clave: 'riesgo', texto: 'Riesgo' },
]

/**
 * La tabla maestra: un fondo por fila, la hoja `Distributivos` entera.
 *
 * Son mas de treinta columnas y no hay forma de que entren sin scroll
 * horizontal. Tres cosas la hacen legible:
 *
 * - **El nombre queda fijo.** Al llegar al Sharpe de 5Y la fila tiene que
 *   seguir teniendo dueño, o deja de significar nada.
 * - **La celda se pinta.** El fondo dice el signo y el tamaño contra la escala
 *   de lo que se esta mirando, asi que un mal trimestre salta antes de leer la
 *   cifra. La tinta no cambia: verde sobre verde borra el numero.
 * - **Los bloques se apagan.** Quien viene a mirar Sharpe no necesita los ocho
 *   años calendario, y apagarlos deja la tabla en una pantalla.
 *
 * Y sobre todo: la fila abre. La tabla contesta «cuanto rindio»; el panel
 * contesta «como llego hasta ahi» y deja corregir el mes que este mal.
 *
 * Ordenar y filtrar es del cliente y no del servidor a proposito: son sesenta
 * filas ya calculadas, y un viaje a la base por cada click en una cabecera es
 * latencia que no compra nada.
 */
export function TablaFondos({ metricas, series, clases, riskFree, sinTreasury }: Props) {
  const [orden, setOrden] = useState<Orden>({ tipo: 'nombre' })
  const [descendente, setDescendente] = useState(false)
  const [clase, setClase] = useState<string>('todas')
  const [busqueda, setBusqueda] = useState('')
  const [apagados, setApagados] = useState<readonly Bloque[]>([])
  const [abierto, setAbierto] = useState<string | null>(null)

  const encendido = (bloque: Bloque) => !apagados.includes(bloque)

  const alternar = (bloque: Bloque) =>
    setApagados((previo) =>
      previo.includes(bloque) ? previo.filter((b) => b !== bloque) : [...previo, bloque],
    )

  const porFondo = useMemo(
    () => new Map(series.map((s) => [s.fondoId, s.observaciones])),
    [series],
  )

  /** La chispa mira los ultimos dos años: la forma reciente, no la historia entera. */
  const chispas = useMemo(() => {
    const mapa = new Map<string, ReturnType<typeof crecimiento>>()
    for (const s of series) {
      const recientes = s.observaciones.filter((o) => o.retornoTotal !== null).slice(-24)
      mapa.set(s.fondoId, crecimiento(recientes))
    }
    return mapa
  }, [series])

  /** Los anios que alguna fila tiene con dato, del mas reciente al mas viejo. */
  const anios = useMemo(() => {
    const conDato = new Set<number>()
    for (const m of metricas) {
      for (const a of m.anios) if (a.mesesUsados > 0) conDato.add(a.anio)
    }
    return [...conDato].sort((a, b) => b - a)
  }, [metricas])

  const visibles = useMemo(() => {
    const texto = busqueda.trim().toLowerCase()
    const filtradas = metricas.filter(
      (m) =>
        (clase === 'todas' || m.fondo.assetClass === clase) &&
        (texto === '' || m.fondo.nombre.toLowerCase().includes(texto)),
    )

    /**
     * Un fondo sin dato en la columna que ordena va siempre al final, ordene
     * como ordene. Si viajara con el resto, invertir el sentido lo pondria
     * primero y la tabla arrancaria con una pantalla de «n/d».
     */
    const valor = (m: MetricasFondo): number | null => {
      if (orden.tipo === 'nombre' || orden.tipo === 'clase') return null
      if (orden.tipo === 'anio') {
        return m.anios.find((a) => a.anio === orden.anio)?.retorno ?? null
      }
      const v = m.ventanas.find((x) => x.ventana === orden.clave)
      const campo = v?.[orden.campo]
      return typeof campo === 'number' ? campo : null
    }

    return [...filtradas].sort((a, b) => {
      if (orden.tipo === 'nombre') {
        const cmp = a.fondo.nombre.localeCompare(b.fondo.nombre, 'es')
        return descendente ? -cmp : cmp
      }
      if (orden.tipo === 'clase') {
        const cmp =
          a.fondo.assetClass.localeCompare(b.fondo.assetClass, 'es') ||
          a.fondo.nombre.localeCompare(b.fondo.nombre, 'es')
        return descendente ? -cmp : cmp
      }

      const va = valor(a)
      const vb = valor(b)
      if (va === null && vb === null) return a.fondo.nombre.localeCompare(b.fondo.nombre, 'es')
      if (va === null) return 1
      if (vb === null) return -1
      return descendente ? vb - va : va - vb
    })
  }, [metricas, clase, busqueda, orden, descendente])

  /**
   * La escala del mapa de calor: percentil 90 de lo que se esta mirando.
   *
   * Sale de las filas visibles y no de un numero fijo. Filtrado a crédito
   * privado, donde todo vive entre 0.5% y 12%, una escala pensada para venture
   * dejaria la tabla entera en blanco y el color no diria nada.
   */
  const escala = useMemo(() => {
    const valores: number[] = []
    for (const m of visibles) {
      for (const v of m.ventanas) if (v.retorno !== null) valores.push(Math.abs(v.retorno))
    }
    if (valores.length === 0) return 0.1
    valores.sort((a, b) => a - b)
    return valores[Math.floor(valores.length * 0.9)] ?? 0.1
  }, [visibles])

  const alOrdenar = (nuevo: Orden) => {
    const mismo = JSON.stringify(nuevo) === JSON.stringify(orden)
    if (mismo) {
      setDescendente(!descendente)
      return
    }
    setOrden(nuevo)
    // Una columna de numeros se abre de mayor a menor, que es la pregunta que
    // alguien hace al apretarla; una de texto, alfabetica.
    setDescendente(nuevo.tipo !== 'nombre' && nuevo.tipo !== 'clase')
  }

  const flecha = (nuevo: Orden) =>
    JSON.stringify(nuevo) === JSON.stringify(orden) ? (descendente ? ' ↓' : ' ↑') : ''

  const ventana = (m: MetricasFondo, clave: string): MetricaVentana | undefined =>
    m.ventanas.find((v) => v.ventana === clave)

  const anio = (m: MetricasFondo, numero: number): MetricaAnual | undefined =>
    m.anios.find((a) => a.anio === numero)

  const conRiesgo = VENTANAS.filter((v) => VENTANAS_CON_RIESGO.includes(v.clave))

  /**
   * Lo que se ve, tal como se ve, a un CSV.
   *
   * Exporta las filas visibles y en el orden en pantalla, no la tabla entera:
   * quien filtro por Hedge Funds y ordeno por Sharpe quiere justamente eso, y
   * un export que ignora los filtros obliga a rehacer el trabajo en el Excel
   * del que se venia escapando.
   */
  const exportar = () => {
    const cabecera = [
      'Fondo',
      'Asset Class',
      'Inception',
      'Guidance',
      'Domicilio',
      ...VENTANAS.map((v) => v.etiqueta),
      ...anios.map(String),
      ...conRiesgo.map((v) => `Desv ${v.etiqueta}`),
      ...conRiesgo.map((v) => `Sharpe ${v.etiqueta}`),
    ]

    const cifra = (valor: number | null | undefined) =>
      valor === null || valor === undefined ? '' : String(valor)

    const filas = visibles.map((m) => [
      m.fondo.nombre,
      m.fondo.assetClass,
      m.fondo.inception ?? '',
      cifra(m.fondo.guidanceCortoPlazo),
      m.fondo.domicilio ?? '',
      ...VENTANAS.map((v) => cifra(ventana(m, v.clave)?.retorno)),
      ...anios.map((a) => cifra(anio(m, a)?.retorno)),
      ...conRiesgo.map((v) => cifra(ventana(m, v.clave)?.desviacion)),
      ...conRiesgo.map((v) => cifra(ventana(m, v.clave)?.sharpe)),
    ])

    const csv = [cabecera, ...filas]
      .map((fila) => fila.map((celda) => `"${celda.replace(/"/g, '""')}"`).join(','))
      .join('\n')

    /* El BOM es lo que hace que Excel abra el archivo en UTF-8 y no rompa los
       acentos de «Año» y de los nombres de los fondos. */
    const enlace = document.createElement('a')
    enlace.href = URL.createObjectURL(new Blob(['\uFEFF' + csv], { type: 'text/csv;charset=utf-8' }))
    enlace.download = 'retornos-fondos.csv'
    enlace.click()
    URL.revokeObjectURL(enlace.href)
  }

  const enPanel = visibles.find((m) => m.fondo.id === abierto) ?? null

  /* El indice de la misma clase, para dibujar contra que se compara el fondo. */
  const referenciaDe = (m: MetricasFondo) => {
    if (m.fondo.esReferencia) return undefined
    const indice = metricas.find(
      (otro) => otro.fondo.esReferencia && otro.fondo.assetClass === m.fondo.assetClass,
    )
    if (indice === undefined) return undefined
    return {
      nombre: indice.fondo.nombre,
      observaciones: porFondo.get(indice.fondo.id) ?? [],
    }
  }

  return (
    <div className={estilos.pantalla}>
      <div className={estilos.filtros}>
        <input
          className={estilos.busqueda}
          type="search"
          placeholder="Buscar un fondo"
          value={busqueda}
          onChange={(e) => setBusqueda(e.target.value)}
          aria-label="Buscar un fondo"
        />

        <select
          className={estilos.select}
          value={clase}
          onChange={(e) => setClase(e.target.value)}
          aria-label="Filtrar por clase de activo"
        >
          <option value="todas">Todas las clases</option>
          {clases.map((c) => (
            <option key={c} value={c}>
              {c}
            </option>
          ))}
        </select>

        <span className={estilos.conteo}>
          {visibles.length} de {metricas.length} fondos
        </span>

        <div className={estilos.bloques} role="group" aria-label="Columnas visibles">
          {BLOQUES.map((b) => (
            <button
              key={b.clave}
              type="button"
              className={encendido(b.clave) ? estilos.bloqueActivo : estilos.bloque}
              onClick={() => alternar(b.clave)}
              aria-pressed={encendido(b.clave)}
            >
              {b.texto}
            </button>
          ))}
        </div>

        <button type="button" className={estilos.exportar} onClick={exportar}>
          Exportar CSV
        </button>
      </div>

      <p className={estilos.nota}>
        {/*
          La tasa no es una sola para la tabla: cada fondo se mide contra el
          Treasury 10Y del mes en que termina su serie. Decirlo importa — dos
          Sharpe de esta columna pueden estar medidos contra tasas distintas, y
          eso es correcto solo si se puede leer.
        */}
        Sharpe contra el Treasury 10Y del último mes de cada fondo.
        {sinTreasury > 0 &&
          ` ${sinTreasury} ${sinTreasury === 1 ? 'fondo usa' : 'fondos usan'} el respaldo de ${pctFondo(riskFree)}: falta cargar su mes.`}{' '}
        <strong>Cualquier fila abre el fondo:</strong> su curva, su peor caída y la serie mes a
        mes, editable.
      </p>

      <div className={estilos.marco}>
        <table className={estilos.tabla}>
          <thead>
            <tr className={estilos.filaGrupos}>
              <th className={`${estilos.fija} ${estilos.thNombre}`} />
              <th />
              {encendido('ficha') && <th colSpan={3} className={estilos.grupo}>Ficha</th>}
              <th colSpan={VENTANAS.length} className={estilos.grupo}>
                Retorno
              </th>
              {encendido('anios') && anios.length > 0 && (
                <th colSpan={anios.length} className={estilos.grupo}>
                  Año calendario
                </th>
              )}
              {encendido('riesgo') && (
                <th colSpan={conRiesgo.length * 2} className={estilos.grupo}>
                  Riesgo
                </th>
              )}
            </tr>
            <tr>
              <th scope="col" className={`${estilos.fija} ${estilos.thNombre}`}>
                <button type="button" onClick={() => alOrdenar({ tipo: 'nombre' })}>
                  Fondo{flecha({ tipo: 'nombre' })}
                </button>
              </th>
              <th scope="col" className={estilos.thChispa} title="Los últimos 24 meses">
                Forma
              </th>

              {encendido('ficha') && (
                <>
                  <th scope="col">
                    <button type="button" onClick={() => alOrdenar({ tipo: 'clase' })}>
                      Asset Class{flecha({ tipo: 'clase' })}
                    </button>
                  </th>
                  <th scope="col">Inception</th>
                  <th
                    scope="col"
                    className={estilos.numerica}
                    title="Retorno objetivo de corto plazo que publica el manager"
                  >
                    Guidance
                  </th>
                </>
              )}

              {VENTANAS.map((v) => (
                <th key={v.clave} scope="col" className={estilos.numerica}>
                  <button
                    type="button"
                    onClick={() =>
                      alOrdenar({ tipo: 'ventana', clave: v.clave, campo: 'retorno' })
                    }
                    title={
                      v.meses !== null && v.meses > 12
                        ? `${v.etiqueta} anualizado`
                        : v.meses === null
                          ? 'Desde inception, siempre anualizado. Una serie de menos de doce meses queda marcada.'
                          : `${v.etiqueta} acumulado`
                    }
                  >
                    {v.etiqueta}
                    {flecha({ tipo: 'ventana', clave: v.clave, campo: 'retorno' })}
                  </button>
                </th>
              ))}

              {encendido('anios') &&
                anios.map((a) => (
                  <th key={a} scope="col" className={estilos.numerica}>
                    <button type="button" onClick={() => alOrdenar({ tipo: 'anio', anio: a })}>
                      {a}
                      {flecha({ tipo: 'anio', anio: a })}
                    </button>
                  </th>
                ))}

              {encendido('riesgo') && (
                <>
                  {conRiesgo.map((v) => (
                    <th key={`d-${v.clave}`} scope="col" className={estilos.numerica}>
                      <button
                        type="button"
                        onClick={() =>
                          alOrdenar({ tipo: 'ventana', clave: v.clave, campo: 'desviacion' })
                        }
                      >
                        Desv {v.etiqueta}
                        {flecha({ tipo: 'ventana', clave: v.clave, campo: 'desviacion' })}
                      </button>
                    </th>
                  ))}

                  {conRiesgo.map((v) => (
                    <th key={`s-${v.clave}`} scope="col" className={estilos.numerica}>
                      <button
                        type="button"
                        onClick={() =>
                          alOrdenar({ tipo: 'ventana', clave: v.clave, campo: 'sharpe' })
                        }
                      >
                        Sharpe {v.etiqueta}
                        {flecha({ tipo: 'ventana', clave: v.clave, campo: 'sharpe' })}
                      </button>
                    </th>
                  ))}
                </>
              )}
            </tr>
          </thead>

          <tbody>
            {visibles.map((m) => (
              <tr
                key={m.fondo.id}
                className={estilos.fila}
                onClick={() => setAbierto(m.fondo.id)}
                tabIndex={0}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' || e.key === ' ') {
                    e.preventDefault()
                    setAbierto(m.fondo.id)
                  }
                }}
                aria-label={`Abrir ${m.fondo.nombre}`}
              >
                <th scope="row" className={`${estilos.fija} ${estilos.nombre}`}>
                  {m.fondo.nombre}
                  {m.fondo.esReferencia && (
                    <span
                      className={estilos.referencia}
                      title="Índice de mercado. Se muestra para comparar; no entra a los rankings."
                    >
                      índice
                    </span>
                  )}
                </th>

                <td className={estilos.celdaChispa}>
                  <Chispa
                    puntos={chispas.get(m.fondo.id) ?? []}
                    titulo={`Forma de ${m.fondo.nombre} en los últimos 24 meses`}
                  />
                </td>

                {encendido('ficha') && (
                  <>
                    <td className={estilos.tenue}>{m.fondo.assetClass}</td>
                    <td className={estilos.tenue}>{mesLargo(m.fondo.inception)}</td>
                    <td className={estilos.numerica}>{pctFondo(m.fondo.guidanceCortoPlazo)}</td>
                  </>
                )}

                {VENTANAS.map((v) => {
                  const dato = ventana(m, v.clave)
                  /*
                   * Since inception se anualiza siempre, tambien con menos de
                   * doce meses de serie — es lo que hace que la columna
                   * signifique lo mismo en un fondo de tres meses y en uno de
                   * diez anios. Pero un 29% proyectado desde un trimestre no
                   * es lo mismo que un 16% de cinco anios, y sin la marca las
                   * dos celdas se leen igual.
                   */
                  const proyectado =
                    v.anualiza === 'siempre' &&
                    dato !== undefined &&
                    dato.mesesUsados > 0 &&
                    dato.mesesUsados < MESES_SIN_ANUALIZAR
                  return (
                    <Celda
                      key={v.clave}
                      valor={dato?.retorno ?? null}
                      escala={escala}
                      sufijo={proyectado ? `${dato.mesesUsados}m` : undefined}
                      titulo={
                        proyectado
                          ? `Anualizado desde ${dato.mesesUsados} meses de serie: es una proyección.`
                          : undefined
                      }
                    />
                  )
                })}

                {encendido('anios') &&
                  anios.map((a) => {
                    const dato = anio(m, a)
                    return (
                      <Celda
                        key={a}
                        valor={dato?.retorno ?? null}
                        escala={escala}
                        sufijo={dato?.parcial === true ? 'YTD' : undefined}
                      />
                    )
                  })}

                {encendido('riesgo') && (
                  <>
                    {conRiesgo.map((v) => (
                      <td key={`d-${v.clave}`} className={estilos.numerica}>
                        {ventana(m, v.clave)?.desviacion === null ||
                        ventana(m, v.clave) === undefined ? (
                          <span className={estilos.sinDato}>{SIN_DATO}</span>
                        ) : (
                          pctFondo(ventana(m, v.clave)!.desviacion)
                        )}
                      </td>
                    ))}

                    {conRiesgo.map((v) => {
                      const valor = ventana(m, v.clave)?.sharpe ?? null
                      return (
                        <td key={`s-${v.clave}`} className={estilos.numerica}>
                          {valor === null ? (
                            <span className={estilos.sinDato}>{SIN_DATO}</span>
                          ) : (
                            sharpe(valor)
                          )}
                        </td>
                      )
                    })}
                  </>
                )}
              </tr>
            ))}
          </tbody>
        </table>

        {visibles.length === 0 && (
          <p className={estilos.vacio}>Ningún fondo coincide con el filtro.</p>
        )}
      </div>

      {enPanel !== null && (
        <PanelFondo
          metricas={enPanel}
          observaciones={porFondo.get(enPanel.fondo.id) ?? []}
          referencia={referenciaDe(enPanel)}
          cerrar={() => setAbierto(null)}
        />
      )}
    </div>
  )
}

/**
 * Una celda de porcentaje, pintada segun cuanto se aparta.
 *
 * Sin dato escribe «n/d» apagado, nunca un cero. El sufijo «YTD» marca el anio
 * incompleto: un 4.8% de medio anio al lado de un 10.9% de anio entero se
 * compara mal si nada dice cual es cual.
 */
function Celda({
  valor,
  escala,
  sufijo,
  titulo,
}: {
  readonly valor: number | null
  readonly escala: number
  readonly sufijo?: string | undefined
  readonly titulo?: string | undefined
}) {
  if (valor === null) {
    return (
      <td className={estilos.numerica}>
        <span className={estilos.sinDato}>{SIN_DATO}</span>
      </td>
    )
  }

  const intensidad = valor === 0 ? 0 : Math.min(1, Math.abs(valor) / (escala * 1.6))
  const fondo =
    intensidad === 0
      ? undefined
      : `color-mix(in srgb, var(${valor > 0 ? '--calor-positivo' : '--calor-negativo'}) ${(
          intensidad * 70
        ).toFixed(0)}%, transparent)`

  return (
    <td
      className={`${estilos.numerica} ${valor < 0 ? estilos.negativo : ''}`}
      title={titulo}
      style={fondo === undefined ? undefined : { background: fondo }}
    >
      {pctFondo(valor)}
      {sufijo !== undefined && <span className={estilos.sufijo}> {sufijo}</span>}
    </td>
  )
}
