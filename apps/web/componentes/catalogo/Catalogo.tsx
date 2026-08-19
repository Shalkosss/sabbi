'use client'

import { useMemo, useState } from 'react'

import type { ListasCatalogo, ProductoEnCatalogo } from '../../lib/datos/catalogo'
import { FormularioProducto } from './FormularioProducto'
import { TablaCatalogo } from './TablaCatalogo'
import estilos from './Catalogo.module.css'

interface Props {
  readonly productos: readonly ProductoEnCatalogo[]
  readonly listas: ListasCatalogo
  readonly descuadrados: readonly string[]
  readonly puedeEditar: boolean
}

const VACIO: ProductoEnCatalogo = {
  id: '',
  nombre: '',
  clase: null,
  moneda: 'USD',
  liquidez: null,
  comisionPct: null,
  retMin: null,
  retMax: null,
  minTicket: null,
  ofrecer: false,
  esProductoSabbi: false,
  subidoACircle: false,
  gestor: null,
  gestorScore: null,
  administrador: null,
  administradorScore: null,
  focoGeografico: [],
  claseActivo: [],
  subyacentes: [],
}

/**
 * El catálogo de productos.
 *
 * Una sola tabla y un solo formulario. Lo que antes se llenaba en cuatro hojas
 * — el producto, su comisión al costado, el score del gestor en otra pestaña y
 * el del administrador más abajo — entra acá una vez, y todo lo que se elige
 * sale de una lista.
 */
export function Catalogo({ productos, listas, descuadrados, puedeEditar }: Props) {
  const [busqueda, setBusqueda] = useState('')
  const [soloDescuadrados, setSoloDescuadrados] = useState(false)
  const [editando, setEditando] = useState<ProductoEnCatalogo | null>(null)

  const rotos = useMemo(() => new Set(descuadrados), [descuadrados])

  const visibles = useMemo(() => {
    const texto = busqueda.trim().toLowerCase()
    return productos.filter((producto) => {
      if (soloDescuadrados && !rotos.has(producto.id)) return false
      if (texto === '') return true
      return (
        producto.nombre.toLowerCase().includes(texto) ||
        (producto.gestor ?? '').toLowerCase().includes(texto) ||
        (producto.administrador ?? '').toLowerCase().includes(texto)
      )
    })
  }, [productos, busqueda, soloDescuadrados, rotos])

  return (
    <div className={estilos.pantalla}>
      <header className={estilos.encabezado}>
        <div>
          <p className="eyebrow">Catálogo</p>
          <h1>Productos</h1>
          <p className={estilos.detalle}>
            {productos.length} productos. La composición de cada uno se valida contra las listas de
            clases, subyacentes y regiones: no hay campo de texto libre donde antes había uno.
          </p>
        </div>
        {puedeEditar && (
          <button type="button" className="primario" onClick={() => setEditando(VACIO)}>
            Nuevo producto
          </button>
        )}
      </header>

      <div className={estilos.filtros}>
        <input
          className={estilos.busqueda}
          value={busqueda}
          placeholder="Buscar por producto, gestor o administrador"
          aria-label="Buscar en el catálogo"
          onChange={(e) => setBusqueda(e.target.value)}
        />
        {rotos.size > 0 && (
          <label className={estilos.interruptor}>
            <input
              type="checkbox"
              checked={soloDescuadrados}
              onChange={(e) => setSoloDescuadrados(e.target.checked)}
            />
            Solo los {rotos.size} que no suman 100%
          </label>
        )}
        <span className={estilos.conteo}>
          {visibles.length === productos.length
            ? `${productos.length} productos`
            : `${visibles.length} de ${productos.length}`}
        </span>
      </div>

      <TablaCatalogo
        productos={visibles}
        descuadrados={rotos}
        alAbrir={puedeEditar ? setEditando : undefined}
      />

      {editando !== null && (
        <FormularioProducto
          producto={editando}
          listas={listas}
          alCerrar={() => setEditando(null)}
        />
      )}
    </div>
  )
}
