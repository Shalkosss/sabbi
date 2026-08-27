'use client'

import { useMemo, useState } from 'react'

import {
  VENTANAS,
  VENTANAS_CON_RIESGO,
  dispersionRiesgoRetorno,
  extremosPorClase,
  rankear,
  resumenPorClase,
} from '@sabbi/core'
import type { MetricasFondo, Puesto } from '@sabbi/core'

import { SIN_DATO, pctFondo, sharpe } from '../../lib/formato'
import { Dispersion } from './Dispersion'
import estilos from './Insights.module.css'

interface Props {
  readonly metricas: readonly MetricasFondo[]
  readonly riskFree: number
}

/**
 * Los comparativos.
 *
 * La tabla maestra contesta «cuanto rindio este fondo». Esta pantalla contesta
 * las que la mesa hace de verdad: cual es el mejor hedge fund, cual es el que
 * mas tiembla, y cual paga el riesgo que toma.
 *
 * Todo cuelga de un solo selector de ventana. Un ranking de 1Y al lado de uno
 * de 5Y invita a leerlos juntos, y no se pueden: son universos distintos de
 * fondos, porque a 5Y sobrevive menos de la mitad.
 */
export function Insights({ metricas, riskFree }: Props) {
  const [ventana, setVentana] = useState('1y')

  const rankings = useMemo(
    () => ({
      sharpe: rankear(metricas, ventana, 'sharpe'),
      retorno: rankear(metricas, ventana, 'retorno'),
      desviacion: rankear(metricas, ventana, 'desviacion'),
    }),
    [metricas, ventana],
  )

  const clases = useMemo(() => extremosPorClase(metricas, ventana), [metricas, ventana])
  const resumen = useMemo(() => resumenPorClase(metricas, ventana), [metricas, ventana])
  const puntos = useMemo(() => dispersionRiesgoRetorno(metricas, ventana), [metricas, ventana])

  const etiqueta = VENTANAS.find((v) => v.clave === ventana)?.etiqueta ?? ventana

  return (
    <div className={estilos.pantalla}>
      <div className={estilos.barra}>
        <label className={estilos.selector}>
          Ventana
          <select value={ventana} onChange={(e) => setVentana(e.target.value)}>
            {VENTANAS.filter((v) => VENTANAS_CON_RIESGO.includes(v.clave)).map((v) => (
              <option key={v.clave} value={v.clave}>
                {v.etiqueta}
              </option>
            ))}
          </select>
        </label>

        <p className={estilos.nota}>
          {rankings.retorno.puestos.length} fondos con historia suficiente para {etiqueta}
          {rankings.retorno.sinDato > 0 && `; ${rankings.retorno.sinDato} quedan afuera`}. Sharpe
          contra un risk-free de {pctFondo(riskFree)}.
        </p>
      </div>

      <section className={estilos.seccion}>
        <h2>Riesgo y retorno</h2>
        <p className={estilos.subtitulo}>
          Cada punto es un fondo. Arriba y a la izquierda es mejor: más retorno por unidad de
          desviación. Los fondos sin las dos coordenadas no aparecen.
        </p>
        <Dispersion puntos={puntos} />
      </section>

      <section className={estilos.seccion}>
        <h2>Por clase de activo</h2>
        <p className={estilos.subtitulo}>
          Comparar un fondo de crédito privado contra uno de venture por retorno crudo no dice
          nada. Adentro de la clase, sí.
        </p>

        <div className={estilos.tarjetas}>
          {clases.map((c) => (
            <article key={c.assetClass} className={estilos.tarjeta}>
              <header>
                <h3>{c.assetClass}</h3>
                <span className={estilos.conteo}>
                  {c.conDato} de {c.total} con dato
                </span>
              </header>

              {c.conDato === 0 ? (
                <p className={estilos.sinDato}>
                  Ningún fondo de esta clase llega a {etiqueta}.
                </p>
              ) : (
                <dl>
                  <Punta rotulo="Mejor retorno" puesto={c.mejorRetorno} formato={pctFondo} />
                  <Punta rotulo="Peor retorno" puesto={c.peorRetorno} formato={pctFondo} />
                  <Punta
                    rotulo="Mayor desviación"
                    puesto={c.mayorDesviacion}
                    formato={pctFondo}
                  />
                  <Punta rotulo="Mejor Sharpe" puesto={c.mejorSharpe} formato={sharpe} />
                </dl>
              )}
            </article>
          ))}
        </div>
      </section>

      <section className={estilos.seccion}>
        <h2>La clase como grupo</h2>
        <p className={estilos.subtitulo}>
          Promedios simples, sin ponderar por patrimonio: esto mide el menú, no las posiciones.
          La dispersión es la distancia entre el mejor y el peor — donde es grande, elegir bien
          es casi todo.
        </p>

        <table className={estilos.tabla}>
          <thead>
            <tr>
              <th scope="col">Asset Class</th>
              <th scope="col" className={estilos.num}>
                Fondos
              </th>
              <th scope="col" className={estilos.num}>
                Retorno promedio
              </th>
              <th scope="col" className={estilos.num}>
                Desviación promedio
              </th>
              <th scope="col" className={estilos.num}>
                Sharpe promedio
              </th>
              <th scope="col" className={estilos.num}>
                Dispersión
              </th>
            </tr>
          </thead>
          <tbody>
            {resumen.map((c) => (
              <tr key={c.assetClass}>
                <th scope="row">{c.assetClass}</th>
                <td className={estilos.num}>
                  {c.conDato}
                  {c.conDato !== c.fondos && (
                    <span className={estilos.deTotal}> / {c.fondos}</span>
                  )}
                </td>
                <td className={estilos.num}>{pctFondo(c.retornoPromedio)}</td>
                <td className={estilos.num}>{pctFondo(c.desviacionPromedio)}</td>
                <td className={estilos.num}>{sharpe(c.sharpePromedio)}</td>
                <td className={estilos.num}>{pctFondo(c.dispersion)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>

      <section className={estilos.seccion}>
        <h2>Rankings</h2>
        <div className={estilos.rankings}>
          <Ranking
            titulo={`Mejor Sharpe — ${etiqueta}`}
            puestos={rankings.sharpe.puestos}
            formato={sharpe}
          />
          <Ranking
            titulo={`Mayor retorno — ${etiqueta}`}
            puestos={rankings.retorno.puestos}
            formato={pctFondo}
          />
          <Ranking
            titulo={`Mayor desviación — ${etiqueta}`}
            puestos={rankings.desviacion.puestos}
            formato={pctFondo}
          />
        </div>
      </section>
    </div>
  )
}

/** Una punta de una clase: el fondo y su cifra, o nada si no hay. */
function Punta({
  rotulo,
  puesto,
  formato,
}: {
  readonly rotulo: string
  readonly puesto: Puesto | null
  readonly formato: (valor: number | null) => string
}) {
  return (
    <>
      <dt>{rotulo}</dt>
      <dd>
        {puesto === null ? (
          <span className={estilos.sinDato}>{SIN_DATO}</span>
        ) : (
          <>
            <span className={estilos.fondoNombre}>{puesto.nombre}</span>
            <span className={estilos.cifra}>{formato(puesto.valor)}</span>
          </>
        )}
      </dd>
    </>
  )
}

/** Los diez primeros. Mas que eso deja de ser un ranking y es la tabla maestra. */
function Ranking({
  titulo,
  puestos,
  formato,
}: {
  readonly titulo: string
  readonly puestos: readonly Puesto[]
  readonly formato: (valor: number | null) => string
}) {
  return (
    <div className={estilos.ranking}>
      <h3>{titulo}</h3>
      {puestos.length === 0 ? (
        <p className={estilos.sinDato}>Ningún fondo llega a esta ventana.</p>
      ) : (
        <ol>
          {puestos.slice(0, 10).map((p) => (
            <li key={p.fondoId}>
              <span className={estilos.puesto}>{p.puesto}</span>
              <span className={estilos.fondoNombre}>{p.nombre}</span>
              <span className={estilos.clase}>{p.assetClass}</span>
              <span className={estilos.cifra}>{formato(p.valor)}</span>
            </li>
          ))}
        </ol>
      )}
    </div>
  )
}
