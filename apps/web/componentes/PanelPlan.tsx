'use client'

import type { PlanResumido } from '../app/acciones'
import { pct, usd } from '../lib/formato'
import estilos from './PanelPlan.module.css'

interface Props {
  readonly plan: PlanResumido
}

const NOMBRE_CLASE: Readonly<Record<string, string>> = {
  inm: 'Inmobiliario Directo',
  fijo: 'Mercados Públicos — Fijo',
  variable: 'Mercados Públicos — Variable',
  privados: 'Mercados Privados',
  cash: 'Cash',
}

/**
 * Resultado del cálculo.
 *
 * El cierre del paso 2: el asesor ve en qué queda el portafolio antes de
 * pasar a la propuesta. La vista completa de las siete secciones es la
 * pantalla siguiente, no ésta.
 */
export function PanelPlan({ plan }: Props) {
  const total = plan.totalObjetivoUsd

  return (
    <section className={estilos.panel} aria-label="Resultado del cálculo">
      <header className={estilos.cabecera}>
        <h2>Portafolio objetivo</h2>
        <p className={estilos.subtitulo}>
          {usd(total)} en total · {usd(plan.dineroNuevoUsd)} a ejecutar
        </p>
      </header>

      <div className={estilos.columnas}>
        <table className={estilos.tabla}>
          <thead>
            <tr>
              <th scope="col">Clase</th>
              <th scope="col" className={estilos.num}>
                Objetivo
              </th>
              <th scope="col" className={estilos.num}>
                %
              </th>
              <th scope="col" className={estilos.num}>
                A comprar
              </th>
            </tr>
          </thead>
          <tbody>
            {plan.porClase.map((clase) => (
              <tr key={clase.clase}>
                <td>
                  {NOMBRE_CLASE[clase.clase] ?? clase.clase}
                  {clase.cerrada && clase.objetivoUsd > 0 && (
                    <span className={estilos.marca} title="Cubierta por lo que el cliente conserva">
                      cerrada
                    </span>
                  )}
                </td>
                <td className={`${estilos.num} mono`}>{usd(clase.objetivoUsd)}</td>
                <td className={`${estilos.num} mono ${estilos.tenue}`}>
                  {pct(total > 0 ? clase.objetivoUsd / total : 0)}
                </td>
                <td className={`${estilos.num} mono`}>
                  {clase.dineroNuevoUsd > 0 ? usd(clase.dineroNuevoUsd) : '—'}
                </td>
              </tr>
            ))}
          </tbody>
          <tfoot>
            <tr>
              <td>Total</td>
              <td className={`${estilos.num} mono`}>{usd(total)}</td>
              <td className={`${estilos.num} mono`}>{pct(1)}</td>
              <td className={`${estilos.num} mono`}>{usd(plan.dineroNuevoUsd)}</td>
            </tr>
          </tfoot>
        </table>

        <div className={estilos.lineas}>
          <h3>Instrumentos</h3>
          <ul>
            {plan.lineas.map((linea) => (
              <li key={`${linea.clase}-${linea.instrumento}`}>
                <span className={estilos.instrumento}>{linea.instrumento}</span>
                <span className={`mono ${estilos.montoLinea}`}>{usd(linea.usd)}</span>
              </li>
            ))}
          </ul>
        </div>
      </div>

      {plan.avisos.length > 0 && (
        <ul className={estilos.avisos}>
          {plan.avisos.map((aviso) => (
            <li key={aviso}>{aviso}</li>
          ))}
        </ul>
      )}
    </section>
  )
}
