import type { FilaExposicion, Propuesta } from '@sabbi/core'

import { pct1, usdTabla } from '../../lib/formato'
import { Seccion, Tabla } from './Seccion'
import estilos from './Propuesta.module.css'

/**
 * Secciones 3, 4 y 5: cómo está repartido el patrimonio hoy.
 *
 * Las tres son particiones del mismo total, vistas por criterios distintos:
 * por asset class, por decisión y por exposición. Que las tres den el mismo
 * número es el control de que nada se perdió en el camino.
 */
export function Distribucion({ propuesta }: { readonly propuesta: Propuesta }) {
  const { seccion3, seccion4, seccion5 } = propuesta

  const conValor = seccion3.filas.filter((fila) => fila.valorUsd > 0)
  const enCero = seccion3.filas.filter((fila) => fila.valorUsd === 0)

  return (
    <>
      <Seccion
        numero={3}
        titulo="Distribución por asset class"
        bajada="Sale de las clases que la ficha realmente trae, no de una lista fija: una clase que el asesor creó en la revisión aparece acá. Una venta parcial se reparte entre las dos columnas."
      >
        <Tabla>
          <thead>
            <tr>
              <th scope="col">Asset class</th>
              <th scope="col" className={estilos.num}>
                Valor USD
              </th>
              <th scope="col" className={estilos.num}>
                Share
              </th>
              <th scope="col" className={estilos.num}>
                Se conserva
              </th>
              <th scope="col" className={estilos.num}>
                Se vende
              </th>
            </tr>
          </thead>
          <tbody>
            {conValor.map((fila) => (
              <tr key={fila.assetClass}>
                <td>{fila.assetClass}</td>
                <td className={estilos.num}>{usdTabla(fila.valorUsd)}</td>
                <td className={estilos.num}>{pct1(fila.share)}</td>
                <td className={estilos.num}>{usdTabla(fila.seConservaUsd)}</td>
                <td className={estilos.num}>{usdTabla(fila.seVendeUsd)}</td>
              </tr>
            ))}
          </tbody>
          <tfoot>
            <tr className={estilos.total}>
              <td>Total</td>
              <td className={estilos.num}>{usdTabla(seccion3.totalUsd)}</td>
              <td className={estilos.num}>{pct1(1)}</td>
              <td className={estilos.num}>
                {usdTabla(conValor.reduce((acc, fila) => acc + fila.seConservaUsd, 0))}
              </td>
              <td className={estilos.num}>
                {usdTabla(conValor.reduce((acc, fila) => acc + fila.seVendeUsd, 0))}
              </td>
            </tr>
          </tfoot>
        </Tabla>

        {enCero.length > 0 && (
          <details className={estilos.completo}>
            <summary>
              Ver las {enCero.length} clases del catálogo que este cliente no tiene
            </summary>
            <p className={estilos.bajada}>
              {enCero.map((fila) => fila.assetClass).join(' · ')}
            </p>
          </details>
        )}
      </Seccion>

      <Seccion
        numero={4}
        titulo="Resumen de decisiones"
        bajada="Cada dólar del patrimonio financiero cae en una sola categoría, así que el total da siempre el 100%. Una posición sin marcar cuenta como conservada: mientras nadie decida venderla, el dinero sigue donde está."
      >
        <Tabla>
          <thead>
            <tr>
              <th scope="col">Decisión</th>
              <th scope="col" className={estilos.num}>
                Valor USD
              </th>
              <th scope="col" className={estilos.num}>
                Share
              </th>
            </tr>
          </thead>
          <tbody>
            {seccion4.filas.map((fila) => (
              <tr key={fila.categoria}>
                <td>{fila.etiqueta}</td>
                <td className={estilos.num}>{usdTabla(fila.valorUsd)}</td>
                <td className={estilos.num}>{pct1(fila.share)}</td>
              </tr>
            ))}
          </tbody>
          <tfoot>
            <tr className={estilos.total}>
              <td>Total</td>
              <td className={estilos.num}>{usdTabla(seccion4.totalUsd)}</td>
              <td className={estilos.num}>{pct1(1)}</td>
            </tr>
          </tfoot>
        </Tabla>
      </Seccion>

      <Seccion
        numero={5}
        titulo="Exposición actual"
        bajada="Por moneda y por plaza, sobre el patrimonio financiero."
      >
        <div className={estilos.parejas}>
          <TablaExposicion titulo="Por moneda" filas={seccion5.porMoneda} />
          <TablaExposicion titulo="Por plaza" filas={seccion5.porPlaza} />
        </div>
      </Seccion>
    </>
  )
}

function TablaExposicion({
  titulo,
  filas,
}: {
  readonly titulo: string
  readonly filas: readonly FilaExposicion[]
}) {
  const total = filas.reduce((acc, fila) => acc + fila.valorUsd, 0)

  return (
    <Tabla>
      <thead>
        <tr>
          <th scope="col">{titulo}</th>
          <th scope="col" className={estilos.num}>
            Valor USD
          </th>
          <th scope="col" className={estilos.num}>
            Share
          </th>
        </tr>
      </thead>
      <tbody>
        {filas.map((fila) => (
          <tr key={fila.etiqueta}>
            <td>{fila.etiqueta}</td>
            <td className={estilos.num}>{usdTabla(fila.valorUsd)}</td>
            <td className={estilos.num}>{pct1(fila.share)}</td>
          </tr>
        ))}
      </tbody>
      <tfoot>
        <tr className={estilos.total}>
          <td>Total</td>
          <td className={estilos.num}>{usdTabla(total)}</td>
          <td className={estilos.num}>{pct1(total > 0 ? 1 : 0)}</td>
        </tr>
      </tfoot>
    </Tabla>
  )
}
