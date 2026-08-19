import type { Propuesta } from '@sabbi/core'

import { pct, usdTabla } from '../../lib/formato'
import { Seccion, Tabla } from './Seccion'
import estilos from './Propuesta.module.css'

const CTA: Readonly<Record<string, string>> = {
  conservar: 'Conservar',
  venta_total: 'Venta total',
  venta_parcial: 'Venta parcial',
  sin_marcar: 'Sin marcar',
}

/**
 * Secciones 1 y 2: lo que el cliente tiene hoy.
 *
 * Los inmuebles en renta salen acá, dentro del patrimonio financiero, porque
 * es donde los pone el motor: se reclasifican a Inmobiliario Directo y su cap
 * rate entra como rendimiento. Los de uso propio van a la sección 2 y no
 * participan de ningún cálculo.
 */
export function FotoActual({ propuesta }: { readonly propuesta: Propuesta }) {
  const { seccion1, seccion2 } = propuesta

  return (
    <>
      <Seccion
        numero={1}
        titulo="Foto actual, patrimonio financiero"
        bajada="Todo lo que entra al cálculo, con la decisión que tomó el asesor sobre cada posición. Los inmuebles en renta figuran acá, reclasificados a Inmobiliario Directo."
      >
        <Tabla>
          <thead>
            <tr>
              <th scope="col">#</th>
              <th scope="col">Institución y producto</th>
              <th scope="col">Tipo (ficha)</th>
              <th scope="col">Asset class</th>
              <th scope="col">Moneda</th>
              <th scope="col">Plaza</th>
              <th scope="col" className={estilos.num}>
                Valor USD
              </th>
              <th scope="col" className={estilos.num}>
                Rend. est.
              </th>
              <th scope="col">Decisión</th>
              <th scope="col" className={estilos.num}>
                A vender
              </th>
              <th scope="col">Notas</th>
            </tr>
          </thead>
          <tbody>
            {seccion1.filas.map((fila) => (
              <tr key={fila.orden}>
                <td className={estilos.tenue}>{fila.orden}</td>
                <td>
                  {fila.institucionProducto}
                  {fila.esInmuebleDeRenta && (
                    <span className={`${estilos.marca} ${estilos.conservada}`}>en renta</span>
                  )}
                </td>
                <td className={estilos.tenue}>{fila.tipoFicha ?? '—'}</td>
                <td>{fila.assetClass ?? '—'}</td>
                <td>{fila.moneda}</td>
                <td>{fila.plaza}</td>
                <td className={estilos.num}>{usdTabla(fila.valorUsd)}</td>
                <td className={estilos.num}>{pct(fila.rendimientoEst)}</td>
                <td>{CTA[fila.cta] ?? fila.cta}</td>
                <td className={estilos.num}>
                  {fila.montoVentaParcialUsd > 0 ? usdTabla(fila.montoVentaParcialUsd) : '—'}
                </td>
                <td className={estilos.tenue}>{fila.nota === '' ? '—' : fila.nota}</td>
              </tr>
            ))}
          </tbody>
          <tfoot>
            <tr className={estilos.total}>
              <td colSpan={6}>Total patrimonio financiero</td>
              <td className={estilos.num}>{usdTabla(seccion1.totalUsd)}</td>
              <td colSpan={4} />
            </tr>
          </tfoot>
        </Tabla>
      </Seccion>

      <Seccion
        numero={2}
        titulo="Inmuebles de uso propio"
        bajada="Fuera del patrimonio financiero. No entran al denominador de ningún porcentaje ni reciben asignación."
      >
        {seccion2.filas.length === 0 ? (
          <p className={estilos.bajada}>La ficha no declara inmuebles de uso propio.</p>
        ) : (
          <Tabla>
            <thead>
              <tr>
                <th scope="col">Inmueble</th>
                <th scope="col">País</th>
                <th scope="col" className={estilos.num}>
                  Pertenencia
                </th>
                <th scope="col" className={estilos.num}>
                  Valor total
                </th>
                <th scope="col" className={estilos.num}>
                  Valor tuyo
                </th>
                <th scope="col">Uso</th>
                <th scope="col" className={estilos.num}>
                  Rend. est.
                </th>
                <th scope="col">Notas</th>
              </tr>
            </thead>
            <tbody>
              {seccion2.filas.map((fila) => (
                <tr key={fila.institucionProducto}>
                  <td>{fila.institucionProducto}</td>
                  <td>{fila.pais ?? '—'}</td>
                  <td className={estilos.num}>{pct(fila.pctPertenencia)}</td>
                  <td className={estilos.num}>{usdTabla(fila.valorTotalUsd)}</td>
                  <td className={estilos.num}>{usdTabla(fila.valorTuyoUsd)}</td>
                  <td>{fila.uso ?? '—'}</td>
                  <td className={estilos.num}>{pct(fila.rendimientoEst)}</td>
                  <td className={estilos.tenue}>{fila.nota === '' ? '—' : fila.nota}</td>
                </tr>
              ))}
            </tbody>
            <tfoot>
              <tr className={estilos.total}>
                <td colSpan={4}>Total uso propio</td>
                <td className={estilos.num}>{usdTabla(seccion2.totalUsd)}</td>
                <td colSpan={3} />
              </tr>
            </tfoot>
          </Tabla>
        )}
      </Seccion>
    </>
  )
}
