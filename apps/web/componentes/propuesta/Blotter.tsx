import type { ClaseModelo, Propuesta } from '@sabbi/core'

import { usdTabla } from '../../lib/formato'
import { Cuadre, Seccion, Tabla } from './Seccion'
import estilos from './Propuesta.module.css'

const NOMBRE_CLASE: Readonly<Record<ClaseModelo, string>> = {
  inm: 'Inmobiliario',
  fijo: 'Renta Fija',
  variable: 'Renta Variable',
  privados: 'Privados',
  cash: 'Cash',
}

/**
 * Sección 7: el blotter.
 *
 * Lo que se ejecuta. Cada dólar que sale de una posición tiene que entrar en
 * una compra, y por eso el cuadre de abajo es el único control que puede
 * frenar la publicación de una propuesta.
 */
export function Blotter({ propuesta }: { readonly propuesta: Propuesta }) {
  const { seccion7 } = propuesta

  return (
    <Seccion
      numero={7}
      titulo="Blotter, cuadre de compras y ventas"
      bajada="Las ventas financian las compras, peso por peso. Si el cuadre no da cero, la propuesta no se puede publicar."
    >
      <div className={estilos.parejas}>
        <Tabla>
          <thead>
            <tr>
              <th scope="col">Instrumento a vender</th>
              <th scope="col">Acción</th>
              <th scope="col" className={estilos.num}>
                USD
              </th>
            </tr>
          </thead>
          <tbody>
            {seccion7.ventas.length === 0 ? (
              <tr>
                <td colSpan={3} className={estilos.tenue}>
                  No se vende nada: el plan se arma solo con lo que el cliente conserva.
                </td>
              </tr>
            ) : (
              seccion7.ventas.map((venta) => (
                <tr key={`${venta.instrumento}-${venta.accion}-${venta.usd}`}>
                  <td>{venta.instrumento}</td>
                  <td className={estilos.tenue}>{venta.accion}</td>
                  <td className={estilos.num}>{usdTabla(venta.usd)}</td>
                </tr>
              ))
            )}
          </tbody>
          <tfoot>
            <tr className={estilos.total}>
              <td colSpan={2}>Total ventas</td>
              <td className={estilos.num}>{usdTabla(seccion7.totalVentasUsd)}</td>
            </tr>
          </tfoot>
        </Tabla>

        <Tabla>
          <thead>
            <tr>
              <th scope="col">Instrumento a comprar</th>
              <th scope="col">Bloque</th>
              <th scope="col" className={estilos.num}>
                USD
              </th>
            </tr>
          </thead>
          <tbody>
            {seccion7.compras.length === 0 ? (
              <tr>
                <td colSpan={3} className={estilos.tenue}>
                  No hay compras: el portafolio objetivo ya está cubierto.
                </td>
              </tr>
            ) : (
              seccion7.compras.map((compra) => (
                <tr key={`${compra.clase}-${compra.instrumento}`}>
                  <td>{compra.instrumento}</td>
                  <td className={estilos.tenue}>{NOMBRE_CLASE[compra.clase]}</td>
                  <td className={estilos.num}>{usdTabla(compra.usd)}</td>
                </tr>
              ))
            )}
          </tbody>
          <tfoot>
            <tr className={estilos.total}>
              <td colSpan={2}>Total compras</td>
              <td className={estilos.num}>{usdTabla(seccion7.totalComprasUsd)}</td>
            </tr>
          </tfoot>
        </Tabla>
      </div>

      <Cuadre
        etiqueta="Compras menos ventas"
        montoUsd={seccion7.cuadreUsd}
        explicacion="hay dinero sin origen o sin destino: la propuesta no se puede publicar así"
      />
    </Seccion>
  )
}
