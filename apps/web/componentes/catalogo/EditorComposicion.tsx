'use client'

import type { ParteEntrada } from '../../app/catalogo/acciones'
import { CampoNumero } from '../CampoNumero'
import estilos from './Catalogo.module.css'

interface Props {
  readonly titulo: string
  readonly opciones: readonly string[]
  readonly partes: readonly ParteEntrada[]
  readonly alCambiar: (partes: readonly ParteEntrada[]) => void
}

/**
 * Una composición, editada por partes.
 *
 * Es el reemplazo de la celda que decía «Perú 75%, Emergentes ex-Perú 15%,
 * Latam ex-Perú 10%». Cada parte es una fila con su lista y su porcentaje, y el
 * total se muestra al lado porque es lo único que hay que mirar: si no da 100,
 * el producto queda marcado en el catálogo.
 *
 * Se permite guardar sin llegar a 100. La planilla real llega con productos al
 * 96% y al 200%, y bloquear el guardado obligaría a inventar el resto para
 * poder salir de la pantalla.
 */
export function EditorComposicion({ titulo, opciones, partes, alCambiar }: Props) {
  const total = partes.reduce((acc, parte) => acc + parte.pct, 0)
  const cierra = Math.abs(total - 1) <= 0.015 || partes.length === 0

  const usadas = new Set(partes.map((parte) => parte.nombre))
  const disponibles = opciones.filter((opcion) => !usadas.has(opcion))

  // Un botón apagado sin explicación manda a nadie a ningún lado. Los dos
  // motivos por los que puede estarlo son distintos y se arreglan distinto:
  // la lista vacía es un catálogo sin importar, y la lista agotada no es un
  // problema.
  const porQueNoSePuede =
    opciones.length === 0
      ? `No hay ${titulo.toLowerCase()} cargadas todavía. Se cargan importando la BD de productos.`
      : 'Ya están todas las partes de la lista en esta composición.'

  const cambiar = (i: number, cambios: Partial<ParteEntrada>) =>
    alCambiar(partes.map((parte, j) => (i === j ? { ...parte, ...cambios } : parte)))

  const quitar = (i: number) => alCambiar(partes.filter((_, j) => j !== i))

  const agregar = () => {
    const siguiente = disponibles[0]
    if (siguiente === undefined) return
    // El resto que falta para cerrar, que es lo que casi siempre se quiere.
    const resto = Math.max(0, Math.round((1 - total) * 10000) / 10000)
    alCambiar([...partes, { nombre: siguiente, pct: resto > 0 ? resto : 0 }])
  }

  return (
    <section className={estilos.composicion}>
      <header className={estilos.composicionCabecera}>
        <span className={estilos.composicionTitulo}>{titulo}</span>
        <span className={cierra ? estilos.totalOk : estilos.totalRoto}>
          {(total * 100).toFixed(1)}%
        </span>
        <button
          type="button"
          className={estilos.agregar}
          disabled={disponibles.length === 0}
          {...(disponibles.length === 0 ? { title: porQueNoSePuede } : {})}
          onClick={agregar}
        >
          Agregar parte
        </button>
      </header>

      {partes.length === 0 ? (
        <p className={estilos.vacio}>
          {opciones.length === 0 ? porQueNoSePuede : 'Sin cargar.'}
        </p>
      ) : (
        <ul className={estilos.filasComposicion}>
          {partes.map((parte, i) => (
            <li key={parte.nombre === '' ? `vacia-${i}` : parte.nombre}>
              <select
                value={parte.nombre}
                aria-label={`${titulo}, parte ${i + 1}`}
                onChange={(e) => cambiar(i, { nombre: e.target.value })}
              >
                {/* La propia queda en la lista; las que ya están en otra fila, no. */}
                {[parte.nombre, ...disponibles]
                  .filter((opcion) => opcion !== '')
                  .map((opcion) => (
                    <option key={opcion} value={opcion}>
                      {opcion}
                    </option>
                  ))}
              </select>

              <span className={estilos.conSufijo}>
                <CampoNumero
                  className="mono"
                  aria-label={`Porcentaje de ${parte.nombre}`}
                  texto={String(Number((parte.pct * 100).toFixed(4)))}
                  alCambiar={(valor) => cambiar(i, { pct: (valor ?? 0) / 100 })}
                />
                <span>%</span>
              </span>

              <button
                type="button"
                className={estilos.quitar}
                aria-label={`Quitar ${parte.nombre}`}
                onClick={() => quitar(i)}
              >
                ×
              </button>
            </li>
          ))}
        </ul>
      )}
    </section>
  )
}
