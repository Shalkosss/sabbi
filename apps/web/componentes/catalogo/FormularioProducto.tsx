'use client'

import { useState, useTransition } from 'react'

import { guardarProducto } from '../../app/catalogo/acciones'
import type { ParteEntrada } from '../../app/catalogo/acciones'
import type { ListasCatalogo, ProductoEnCatalogo } from '../../lib/datos/catalogo'
import { desdeInput, paraInput } from '../../lib/formato'
import { EditorComposicion } from './EditorComposicion'
import estilos from './Catalogo.module.css'

interface Props {
  readonly producto: ProductoEnCatalogo
  readonly listas: ListasCatalogo
  readonly alCerrar: () => void
}

const LIQUIDECES = ['Inmediata', 'Corto plazo', 'Mediano plazo', 'Largo plazo'] as const

/**
 * Alta y edición de un producto.
 *
 * Todo lo que era texto libre en la planilla es acá una lista. No es una
 * preferencia estética: la composición se guarda en filas con clave foránea, y
 * un nombre escrito a mano que no esté en la lista no se puede guardar. Mejor
 * que el formulario no deje escribirlo a que lo rechace la base.
 */
export function FormularioProducto({ producto, listas, alCerrar }: Props) {
  const [nombre, setNombre] = useState(producto.nombre)
  const [moneda, setMoneda] = useState(producto.moneda ?? 'USD')
  const [liquidez, setLiquidez] = useState(producto.liquidez ?? '')
  const [comision, setComision] = useState(paraInput(producto.comisionPct))
  const [retMin, setRetMin] = useState(paraInput(producto.retMin))
  const [retMax, setRetMax] = useState(paraInput(producto.retMax))
  const [gestor, setGestor] = useState(producto.gestor ?? '')
  const [administrador, setAdministrador] = useState(producto.administrador ?? '')
  const [esSabbi, setEsSabbi] = useState(producto.esProductoSabbi)
  const [enCircle, setEnCircle] = useState(producto.subidoACircle)
  const [ofrecer, setOfrecer] = useState(producto.ofrecer)

  const [clase, setClase] = useState<readonly ParteEntrada[]>(producto.claseActivo)
  const [foco, setFoco] = useState<readonly ParteEntrada[]>(producto.focoGeografico)
  const [subyacentes, setSubyacentes] = useState<readonly ParteEntrada[]>(producto.subyacentes)

  const [error, setError] = useState<string | null>(null)
  const [guardando, guardar] = useTransition()

  const esNuevo = producto.id === ''

  const alGuardar = () => {
    setError(null)
    guardar(async () => {
      const resultado = await guardarProducto({
        id: producto.id,
        nombre,
        moneda: moneda === '' ? null : moneda,
        liquidez: liquidez === '' ? null : liquidez,
        comisionPct: desdeInput(comision),
        retMin: desdeInput(retMin),
        retMax: desdeInput(retMax),
        gestor: gestor === '' ? null : gestor,
        administrador: administrador === '' ? null : administrador,
        esProductoSabbi: esSabbi,
        subidoACircle: enCircle,
        ofrecer,
        focoGeografico: foco,
        claseActivo: clase,
        subyacentes,
      })

      if (resultado.ok) alCerrar()
      else setError(resultado.error)
    })
  }

  return (
    <div className={estilos.telon} role="dialog" aria-modal="true" aria-label="Editar producto">
      <div className={estilos.panel}>
        <header className={estilos.panelCabecera}>
          <div>
            <p className="eyebrow">{esNuevo ? 'Nuevo producto' : 'Editar producto'}</p>
            <h2>{nombre === '' ? 'Sin nombre' : nombre}</h2>
          </div>
          <button type="button" className="secundario" onClick={alCerrar}>
            Cerrar
          </button>
        </header>

        <div className={estilos.cuerpo}>
          <label className={estilos.campo}>
            <span>Nombre del producto</span>
            <input value={nombre} onChange={(e) => setNombre(e.target.value)} autoFocus />
          </label>

          <div className={estilos.grilla}>
            <label className={estilos.campo}>
              <span>Moneda</span>
              <select value={moneda} onChange={(e) => setMoneda(e.target.value)}>
                <option value="USD">USD</option>
                <option value="PEN">PEN</option>
              </select>
            </label>

            <label className={estilos.campo}>
              <span>Liquidez</span>
              <select value={liquidez} onChange={(e) => setLiquidez(e.target.value)}>
                <option value="">sin definir</option>
                {LIQUIDECES.map((valor) => (
                  <option key={valor} value={valor}>
                    {valor}
                  </option>
                ))}
              </select>
            </label>

            <label className={estilos.campo}>
              <span>Comisión anual (%)</span>
              <input
                className="mono"
                inputMode="decimal"
                value={comision}
                onChange={(e) => setComision(e.target.value)}
              />
            </label>

            <label className={estilos.campo}>
              <span>Rentabilidad mínima (%)</span>
              <input
                className="mono"
                inputMode="decimal"
                value={retMin}
                onChange={(e) => setRetMin(e.target.value)}
              />
            </label>

            <label className={estilos.campo}>
              <span>Rentabilidad máxima (%)</span>
              <input
                className="mono"
                inputMode="decimal"
                value={retMax}
                onChange={(e) => setRetMax(e.target.value)}
              />
            </label>
          </div>

          <div className={estilos.grilla}>
            <label className={estilos.campo}>
              <span>Gestor</span>
              <select value={gestor} onChange={(e) => setGestor(e.target.value)}>
                <option value="">sin asignar</option>
                {listas.gestores.map((actor) => (
                  <option key={actor.nombre} value={actor.nombre}>
                    {actor.nombre}
                    {actor.score !== null ? ` · score ${actor.score}` : ''}
                  </option>
                ))}
              </select>
            </label>

            <label className={estilos.campo}>
              <span>Administrador</span>
              <select value={administrador} onChange={(e) => setAdministrador(e.target.value)}>
                <option value="">sin asignar</option>
                {listas.administradores.map((actor) => (
                  <option key={actor.nombre} value={actor.nombre}>
                    {actor.nombre}
                    {actor.score !== null ? ` · score ${actor.score}` : ''}
                  </option>
                ))}
              </select>
            </label>
          </div>

          <p className={estilos.ayuda}>
            El score de riesgo viaja con el gestor y con el administrador: no hay que volver a
            escribirlo acá.
          </p>

          <EditorComposicion
            titulo="Clase de activo"
            opciones={listas.clasesActivo}
            partes={clase}
            alCambiar={setClase}
          />
          <EditorComposicion
            titulo="Foco geográfico"
            opciones={listas.regiones}
            partes={foco}
            alCambiar={setFoco}
          />
          <EditorComposicion
            titulo="Subyacentes"
            opciones={listas.subyacentes.map((s) => s.nombre)}
            partes={subyacentes}
            alCambiar={setSubyacentes}
          />

          <div className={estilos.banderas}>
            <label>
              <input
                type="checkbox"
                checked={esSabbi}
                onChange={(e) => setEsSabbi(e.target.checked)}
              />
              Producto Sabbi
            </label>
            <label>
              <input
                type="checkbox"
                checked={ofrecer}
                onChange={(e) => setOfrecer(e.target.checked)}
              />
              Entra al menú del motor
            </label>
            <label>
              <input
                type="checkbox"
                checked={enCircle}
                onChange={(e) => setEnCircle(e.target.checked)}
              />
              Subido a Circle
            </label>
          </div>

          {error !== null && (
            <p role="alert" className={estilos.error}>
              {error}
            </p>
          )}
        </div>

        <footer className={estilos.panelPie}>
          <p className={estilos.ayuda}>
            Una composición que no sume 100% se guarda igual y queda marcada en la lista.
          </p>
          <button type="button" className="primario" disabled={guardando} onClick={alGuardar}>
            {guardando ? 'Guardando…' : 'Guardar'}
          </button>
        </footer>
      </div>
    </div>
  )
}
