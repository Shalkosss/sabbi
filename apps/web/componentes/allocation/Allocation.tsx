import type { MetricasAllocation } from '@sabbi/core'

import type { Referencia } from '../../lib/datos/allocation'
import { MONTO_CURVA } from '../../lib/allocation-escala'
import type { Vista } from '../../lib/allocation'
import { mesLargo, pct1, SIN_DATO } from '../../lib/formato'
import { Controles } from './Controles'
import { Curva } from './Curva'
import { Dona } from './Dona'
import { Escenarios } from './Escenarios'
import estilos from './Allocation.module.css'

/**
 * Qué le pasa a un portafolio clásico cuando se le mete alternativos.
 *
 * Las tres secciones van una debajo de la otra y no en pestañas. Son tres
 * respuestas a la misma pregunta —cómo queda la torta, qué rindió, qué hizo
 * cuando se cayó todo— y la tercera es justamente la que nadie abriría si
 * hubiera que hacer clic para verla.
 *
 * Los deltas van con flecha y sin color: verde y rojo convierten una
 * comparación en un veredicto, y una volatilidad más baja no es «buena» sin
 * saber a cambio de qué. La flecha dice la dirección y el número la magnitud,
 * que es todo lo que la fila tiene que decir.
 */
export function Allocation({
  vista,
  referencias,
}: {
  readonly vista: Vista
  readonly referencias: readonly Referencia[]
}) {
  const { base, conAlternativos } = vista
  const hayCifras = vista.problema === null && conAlternativos.metricas.meses > 0

  return (
    <div className={estilos.hoja}>
      <header className={estilos.cabecera}>
        <p className="eyebrow">Allocation</p>
        <h1>El portafolio clásico con alternativos encima</h1>
      </header>

      <section className={estilos.panel}>
        <Controles
          perfil={vista.perfil}
          mezcla={vista.mezcla}
          mezclas={vista.mezclas}
          asignacion={vista.asignacion}
        />
      </section>

      <section className={estilos.panel}>
        <h2>Asignación</h2>
        <div className={estilos.donas}>
          <Dona titulo={base.nombre} tajadas={base.tajadas} />
          <Dona titulo={conAlternativos.nombre} tajadas={conAlternativos.tajadas} />
        </div>
      </section>

      <section className={estilos.panel}>
        <h2>
          Retorno histórico
          {vista.desde !== null && vista.hasta !== null && (
            <span className={estilos.rango}>
              {mesLargo(vista.desde)} – {mesLargo(vista.hasta)}
            </span>
          )}
        </h2>

        {vista.problema !== null && <p className={estilos.problema}>{vista.problema}</p>}

        {hayCifras && (
          <>
            <table className={estilos.tabla}>
              <thead>
                <tr>
                  <th scope="col">Portafolio</th>
                  <th scope="col">Retorno acumulado</th>
                  <th scope="col">Retorno anualizado</th>
                  <th scope="col">Volatilidad anualizada</th>
                  <th scope="col">
                    Máxima caída
                    {conAlternativos.metricas.caidaDesde !== null && (
                      <span className={estilos.subtitulo}>
                        {mesLargo(conAlternativos.metricas.caidaDesde)} –{' '}
                        {mesLargo(conAlternativos.metricas.caidaHasta)}
                      </span>
                    )}
                  </th>
                </tr>
              </thead>
              <tbody>
                <Fila metricas={base.metricas} nombre={base.nombre} />
                <Fila
                  metricas={conAlternativos.metricas}
                  nombre={conAlternativos.nombre}
                  contra={base.metricas}
                />
              </tbody>
            </table>

            <Curva base={base} conAlternativos={conAlternativos} monto={MONTO_CURVA} />
          </>
        )}
      </section>

      {hayCifras && (
        <section className={estilos.panel}>
          <h2>Escenarios</h2>
          <Escenarios base={base} conAlternativos={conAlternativos} />
        </section>
      )}

      <section className={estilos.panel}>
        <h2>Con qué se midió</h2>
        <ul className={estilos.referencias}>
          {referencias.map((referencia) => (
            <li key={referencia.clase}>
              <b>{referencia.clase}</b>
              <span>{referencia.indice}</span>
              <span className={estilos.cobertura}>
                {referencia.desde === null
                  ? 'sin meses cargados'
                  : `${mesLargo(referencia.desde)} – ${mesLargo(referencia.hasta)} · ${referencia.meses} meses`}
              </span>
            </li>
          ))}
        </ul>
      </section>
    </div>
  )
}

/** Una fila de la tabla. La segunda lleva además el delta contra la primera. */
function Fila({
  nombre,
  metricas,
  contra,
}: {
  readonly nombre: string
  readonly metricas: MetricasAllocation
  readonly contra?: MetricasAllocation
}) {
  const celdas = [
    { valor: metricas.acumulado, previo: contra?.acumulado },
    { valor: metricas.anualizado, previo: contra?.anualizado },
    { valor: metricas.volatilidad, previo: contra?.volatilidad },
    { valor: metricas.maximaCaida, previo: contra?.maximaCaida },
  ]

  return (
    <tr>
      <th scope="row">
        {nombre}
        {metricas.desde !== null && (
          <span className={estilos.subtitulo}>
            {metricas.desde} – {metricas.hasta}
          </span>
        )}
      </th>

      {celdas.map((celda, i) => (
        <td key={i}>
          <span className={estilos.cifra}>
            {celda.valor === null ? SIN_DATO : pct1(celda.valor)}
          </span>
          {celda.valor !== null && celda.previo !== null && celda.previo !== undefined && (
            <Delta valor={celda.valor - celda.previo} />
          )}
        </td>
      ))}
    </tr>
  )
}

/**
 * La diferencia contra el portafolio clásico.
 *
 * Flecha y magnitud, sin color. Una caída de volatilidad no es una buena
 * noticia por sí sola —se paga con algo— y pintarla de verde ya contestó la
 * pregunta que el asesor tenía que contestar con el cliente delante.
 */
function Delta({ valor }: { readonly valor: number }) {
  if (Math.abs(valor) < 0.0005) return <span className={estilos.delta}>sin cambio</span>

  return (
    // La flecha es decorativa y el lector de pantalla necesita la palabra: un
    // «↑ 0.4%» leído en voz alta es «0.4%», que es la mitad del dato.
    <span className={estilos.delta} aria-label={`${valor > 0 ? 'sube' : 'baja'} ${pct1(Math.abs(valor))}`}>
      <span aria-hidden="true">
        {valor > 0 ? '↑' : '↓'} {pct1(Math.abs(valor))}
      </span>
    </span>
  )
}
