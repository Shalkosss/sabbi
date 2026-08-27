'use client'

import type { PuntoDispersion } from '@sabbi/core'

import { pctFondo, sharpe } from '../../lib/formato'
import estilos from './Dispersion.module.css'

const ANCHO = 720
const ALTO = 380
const MARGEN = { arriba: 16, derecha: 16, abajo: 42, izquierda: 58 } as const

const UTIL = {
  ancho: ANCHO - MARGEN.izquierda - MARGEN.derecha,
  alto: ALTO - MARGEN.arriba - MARGEN.abajo,
} as const

/**
 * Paleta por clase de activo.
 *
 * Se asigna por posicion en la lista de clases presentes y no por nombre: si
 * mañana la mesa agrega «Secondaries», entra sin tocar esto. Son los mismos
 * roles de color del sistema, asi que el juego oscuro sale gratis.
 */
const COLORES = [
  'var(--acento)',
  'var(--atencion)',
  'var(--serie-3, #d08b2c)',
  'var(--serie-4, #3b8ea5)',
  'var(--serie-5, #a8577e)',
  'var(--serie-6, #6b8f3a)',
] as const

/**
 * Riesgo contra retorno, un punto por fondo.
 *
 * Es el grafico que ordena la conversacion. Dos fondos con el mismo retorno y
 * el doble de desviacion no son el mismo producto, y eso en una tabla de
 * treinta columnas hay que reconstruirlo con la vista.
 *
 * SVG a mano por el mismo argumento que `GraficoBenchmark`: la forma es unos
 * circulos y dos ejes, y traerse una libreria de graficos al navegador seria
 * pagar mucho por poco.
 *
 * La diagonal punteada es el lugar donde retorno y desviacion son iguales —
 * Sharpe cercano a uno si el risk-free fuera cero. No es una frontera teorica,
 * es una referencia visual: arriba de ella, el fondo paga mas de lo que
 * tiembla.
 */
export function Dispersion({ puntos }: { readonly puntos: readonly PuntoDispersion[] }) {
  if (puntos.length === 0) {
    return <p className={estilos.vacio}>Ningún fondo tiene las dos coordenadas en esta ventana.</p>
  }

  const clases = [...new Set(puntos.map((p) => p.assetClass))].sort((a, b) =>
    a.localeCompare(b, 'es'),
  )
  const colorDe = (clase: string) => COLORES[clases.indexOf(clase) % COLORES.length]

  /*
   * Los ejes arrancan en cero y no en el minimo de los datos. Recortar el eje
   * exagera las diferencias: dos fondos que rinden 8% y 9% se ven al doble de
   * distancia si el eje empieza en 7.9%, y esa distorsion es justo la que hace
   * que alguien elija mal.
   */
  const maxRetorno = Math.max(...puntos.map((p) => p.retorno), 0)
  const minRetorno = Math.min(...puntos.map((p) => p.retorno), 0)
  const maxDesv = Math.max(...puntos.map((p) => p.desviacion), 0)

  const holgura = (valor: number) => (valor === 0 ? 1 : valor * 1.1)
  const techoY = holgura(maxRetorno)
  const pisoY = minRetorno < 0 ? minRetorno * 1.1 : 0
  const techoX = holgura(maxDesv)

  const x = (desviacion: number) => MARGEN.izquierda + (desviacion / techoX) * UTIL.ancho
  const y = (retorno: number) =>
    MARGEN.arriba + UTIL.alto - ((retorno - pisoY) / (techoY - pisoY)) * UTIL.alto

  const marcasY = [0, 0.25, 0.5, 0.75, 1].map((f) => pisoY + f * (techoY - pisoY))
  const marcasX = [0, 0.25, 0.5, 0.75, 1].map((f) => f * techoX)

  /* La diagonal solo se dibuja donde las dos escalas se pisan. */
  const diagonalHasta = Math.min(techoX, techoY)

  return (
    <div className={estilos.marco}>
      <svg
        viewBox={`0 0 ${ANCHO} ${ALTO}`}
        className={estilos.grafico}
        role="img"
        aria-label={`Dispersión de ${puntos.length} fondos: desviación estándar contra retorno`}
      >
        {marcasY.map((valor) => (
          <g key={`y-${valor}`}>
            <line
              x1={MARGEN.izquierda}
              x2={ANCHO - MARGEN.derecha}
              y1={y(valor)}
              y2={y(valor)}
              className={valor === 0 ? estilos.ejeCero : estilos.reja}
            />
            <text x={MARGEN.izquierda - 8} y={y(valor) + 4} className={estilos.rotuloEje}>
              {pctFondo(valor)}
            </text>
          </g>
        ))}

        {marcasX.map((valor) => (
          <text
            key={`x-${valor}`}
            x={x(valor)}
            y={ALTO - MARGEN.abajo + 18}
            className={estilos.rotuloEje}
            textAnchor="middle"
          >
            {pctFondo(valor)}
          </text>
        ))}

        {diagonalHasta > 0 && (
          <line
            x1={x(0)}
            y1={y(0)}
            x2={x(diagonalHasta)}
            y2={y(diagonalHasta)}
            className={estilos.diagonal}
          />
        )}

        <text
          x={MARGEN.izquierda + UTIL.ancho / 2}
          y={ALTO - 6}
          className={estilos.tituloEje}
          textAnchor="middle"
        >
          Desviación estándar anualizada
        </text>

        {puntos.map((p) => (
          <circle
            key={p.fondoId}
            cx={x(p.desviacion)}
            cy={y(p.retorno)}
            r={5}
            fill={colorDe(p.assetClass)}
            className={estilos.punto}
          >
            <title>
              {`${p.nombre} — ${p.assetClass}\nRetorno ${pctFondo(p.retorno)} · Desviación ${pctFondo(p.desviacion)} · Sharpe ${sharpe(p.sharpe)}`}
            </title>
          </circle>
        ))}
      </svg>

      <ul className={estilos.leyenda}>
        {clases.map((clase) => (
          <li key={clase}>
            <span className={estilos.muestra} style={{ background: colorDe(clase) }} />
            {clase}
          </li>
        ))}
      </ul>
    </div>
  )
}
