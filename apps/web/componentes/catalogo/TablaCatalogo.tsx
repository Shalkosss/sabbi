'use client'

import type { Parte, ProductoEnCatalogo } from '../../lib/datos/catalogo'
import { pct1 } from '../../lib/formato'
import estilos from './Catalogo.module.css'

interface Props {
  readonly productos: readonly ProductoEnCatalogo[]
  readonly descuadrados: ReadonlySet<string>
  /** Sin permiso de edición la tabla se lee, no se toca. */
  readonly alAbrir: ((producto: ProductoEnCatalogo) => void) | undefined
}

/** Los puntos porcentuales de la planilla, tal como los guarda la tabla. */
const puntos = (valor: number | null): string => (valor === null ? '—' : `${valor}%`)

const rango = (min: number | null, max: number | null): string => {
  if (min === null && max === null) return '—'
  if (min === max || max === null) return `${min}%`
  if (min === null) return `${max}%`
  return `${min}% a ${max}%`
}

/** La composición, en una línea. La parte grande primero. */
function Composicion({ partes }: { readonly partes: readonly Parte[] }) {
  if (partes.length === 0) return <span className={estilos.vacio}>sin cargar</span>

  return (
    <span className={estilos.partes}>
      {partes.map((parte) => (
        <span key={parte.nombre} className={estilos.parte}>
          {parte.nombre}
          <b>{pct1(parte.pct)}</b>
        </span>
      ))}
    </span>
  )
}

function Score({ nombre, score }: { readonly nombre: string | null; readonly score: number | null }) {
  if (nombre === null) return <span className={estilos.vacio}>sin asignar</span>

  return (
    <span className={estilos.actor}>
      {nombre}
      {score !== null && <b className={estilos.score}>{score}</b>}
    </span>
  )
}

export function TablaCatalogo({ productos, descuadrados, alAbrir }: Props) {
  return (
    <div className={estilos.envoltorio}>
      <table className={estilos.tabla}>
        <thead>
          <tr>
            <th scope="col">Producto</th>
            <th scope="col">Clase de activo</th>
            <th scope="col">Foco geográfico</th>
            <th scope="col">Subyacentes</th>
            <th scope="col">Gestor</th>
            <th scope="col">Administrador</th>
            <th scope="col">Moneda</th>
            <th scope="col">Liquidez</th>
            <th scope="col" className={estilos.num}>
              Comisión
            </th>
            <th scope="col" className={estilos.num}>
              Rentabilidad
            </th>
          </tr>
        </thead>
        <tbody>
          {productos.map((producto) => (
            <tr
              key={producto.id}
              className={descuadrados.has(producto.id) ? estilos.descuadrado : undefined}
            >
              <td>
                {alAbrir === undefined ? (
                  <span className={estilos.nombre}>{producto.nombre}</span>
                ) : (
                  <button
                    type="button"
                    className={estilos.nombreBoton}
                    onClick={() => alAbrir(producto)}
                  >
                    {producto.nombre}
                  </button>
                )}
                <span className={estilos.marcas}>
                  {producto.esProductoSabbi && <span className={estilos.marcaSabbi}>Sabbi</span>}
                  {producto.ofrecer && <span className={estilos.marca}>se ofrece</span>}
                  {descuadrados.has(producto.id) && (
                    <span className={estilos.marcaAlerta}>no suma 100%</span>
                  )}
                </span>
              </td>
              <td>
                <Composicion partes={producto.claseActivo} />
              </td>
              <td>
                <Composicion partes={producto.focoGeografico} />
              </td>
              <td>
                <Composicion partes={producto.subyacentes} />
              </td>
              <td>
                <Score nombre={producto.gestor} score={producto.gestorScore} />
              </td>
              <td>
                <Score nombre={producto.administrador} score={producto.administradorScore} />
              </td>
              <td>{producto.moneda ?? '—'}</td>
              <td>{producto.liquidez ?? '—'}</td>
              <td className={estilos.num}>{puntos(producto.comisionPct)}</td>
              <td className={estilos.num}>{rango(producto.retMin, producto.retMax)}</td>
            </tr>
          ))}
        </tbody>
      </table>

      {productos.length === 0 && (
        <p className={estilos.sinResultados}>
          Ningún producto coincide. Si el catálogo está vacío, todavía falta correr la importación.
        </p>
      )}
    </div>
  )
}
