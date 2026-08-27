'use client'

import { useMemo, useState } from 'react'

import { VENTANAS, VENTANAS_CON_RIESGO } from '@sabbi/core'
import type { MetricaAnual, MetricasFondo, MetricaVentana } from '@sabbi/core'

import { SIN_DATO, mesLargo, pctFondo, sharpe } from '../../lib/formato'
import estilos from './TablaFondos.module.css'

interface Props {
  readonly metricas: readonly MetricasFondo[]
  readonly clases: readonly string[]
  readonly riskFree: number
}

/** Las columnas ordenables, con de donde sale el numero de cada una. */
type Orden =
  | { readonly tipo: 'nombre' }
  | { readonly tipo: 'clase' }
  | { readonly tipo: 'ventana'; readonly clave: string; readonly campo: keyof MetricaVentana }
  | { readonly tipo: 'anio'; readonly anio: number }

/**
 * La tabla maestra: un fondo por fila, la hoja `Distributivos` entera.
 *
 * Son mas de treinta columnas y no hay forma de que entren sin scroll
 * horizontal. Lo que la hace legible es que la primera columna queda fija:
 * el nombre del fondo tiene que seguir a la vista cuando se llega al Sharpe
 * de 5Y, o la fila deja de significar nada.
 *
 * Ordenar es del cliente y no del servidor a proposito: son cuarenta filas ya
 * calculadas, y un viaje a la base por cada click en una cabecera es latencia
 * que no compra nada.
 */
export function TablaFondos({ metricas, clases, riskFree }: Props) {
  const [orden, setOrden] = useState<Orden>({ tipo: 'nombre' })
  const [descendente, setDescendente] = useState(false)
  const [clase, setClase] = useState<string>('todas')
  const [busqueda, setBusqueda] = useState('')

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

        <span className={estilos.nota}>
          Sharpe contra un risk-free de {pctFondo(riskFree)}, igual para toda ventana.
        </span>
      </div>

      <div className={estilos.marco}>
        <table className={estilos.tabla}>
          <thead>
            <tr>
              <th scope="col" className={`${estilos.fija} ${estilos.thNombre}`}>
                <button type="button" onClick={() => alOrdenar({ tipo: 'nombre' })}>
                  Fondo{flecha({ tipo: 'nombre' })}
                </button>
              </th>
              <th scope="col">
                <button type="button" onClick={() => alOrdenar({ tipo: 'clase' })}>
                  Asset Class{flecha({ tipo: 'clase' })}
                </button>
              </th>
              <th scope="col">Inception</th>
              <th scope="col" title="Retorno objetivo de corto plazo que publica el manager">
                Guidance
              </th>
              <th scope="col">Domicilio</th>

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
                          ? 'Desde inception, anualizado'
                          : `${v.etiqueta} acumulado`
                    }
                  >
                    {v.etiqueta}
                    {flecha({ tipo: 'ventana', clave: v.clave, campo: 'retorno' })}
                  </button>
                </th>
              ))}

              {anios.map((a) => (
                <th key={a} scope="col" className={estilos.numerica}>
                  <button type="button" onClick={() => alOrdenar({ tipo: 'anio', anio: a })}>
                    {a}
                    {flecha({ tipo: 'anio', anio: a })}
                  </button>
                </th>
              ))}

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
            </tr>
          </thead>

          <tbody>
            {visibles.map((m) => (
              <tr key={m.fondo.id}>
                <th scope="row" className={`${estilos.fija} ${estilos.nombre}`}>
                  {m.fondo.nombre}
                </th>
                <td className={estilos.tenue}>{m.fondo.assetClass}</td>
                <td className={estilos.tenue}>{mesLargo(m.fondo.inception)}</td>
                <td className={estilos.numerica}>{pctFondo(m.fondo.guidanceCortoPlazo)}</td>
                <td className={estilos.tenue}>{m.fondo.domicilio ?? SIN_DATO}</td>

                {VENTANAS.map((v) => (
                  <Celda key={v.clave} valor={ventana(m, v.clave)?.retorno ?? null} />
                ))}

                {anios.map((a) => {
                  const dato = anio(m, a)
                  return (
                    <Celda
                      key={a}
                      valor={dato?.retorno ?? null}
                      sufijo={dato?.parcial === true ? 'YTD' : undefined}
                    />
                  )
                })}

                {conRiesgo.map((v) => (
                  <Celda key={`d-${v.clave}`} valor={ventana(m, v.clave)?.desviacion ?? null} />
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
              </tr>
            ))}
          </tbody>
        </table>

        {visibles.length === 0 && (
          <p className={estilos.vacio}>Ningún fondo coincide con el filtro.</p>
        )}
      </div>
    </div>
  )
}

/**
 * Una celda de porcentaje.
 *
 * Sin dato escribe «n/d» apagado, nunca un cero. El sufijo «YTD» marca el anio
 * incompleto: un 4.8% de medio anio al lado de un 10.9% de anio entero se
 * compara mal si nada dice cual es cual.
 */
function Celda({
  valor,
  sufijo,
}: {
  readonly valor: number | null
  readonly sufijo?: string | undefined
}) {
  if (valor === null) {
    return (
      <td className={estilos.numerica}>
        <span className={estilos.sinDato}>{SIN_DATO}</span>
      </td>
    )
  }

  return (
    <td className={`${estilos.numerica} ${valor < 0 ? estilos.negativo : ''}`}>
      {pctFondo(valor)}
      {sufijo !== undefined && <span className={estilos.sufijo}> {sufijo}</span>}
    </td>
  )
}
