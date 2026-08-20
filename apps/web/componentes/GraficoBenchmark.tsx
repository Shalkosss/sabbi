import type { ClaseModelo, Perfil } from '@sabbi/core'

import type { Matriz } from '../lib/benchmark'
import { NOMBRE_CLASE, NOMBRE_CLASE_CORTO, ORDEN_CLASES } from '../lib/clases'
import { pct1, usdTabla } from '../lib/formato'
import estilos from './GraficoBenchmark.module.css'

/**
 * La matriz, en un panel por monto.
 *
 * La tabla de abajo dice los números; esto dice la forma. Dónde tiene su pico
 * cada perfil y cómo se mueve ese pico cuando cambia el ticket es lo que hay
 * que mirar para juzgar una regla, y eso en una tabla de veinte filas hay que
 * reconstruirlo con la vista.
 *
 * Es SVG escrito a mano y no una librería de gráficos. La forma es simple
 * —cinco puntos y una línea por perfil— y traerse trescientos kilobytes de
 * JavaScript al navegador para dibujarla sería pagar mucho por poco. Además
 * sale del servidor ya dibujado: no parpadea ni espera a hidratar.
 *
 * Sin cifras sobre los puntos a propósito: están en la tabla justo debajo, y
 * repetirlas acá obligaría a resolver el solapamiento de tres etiquetas que
 * caen en el mismo lugar. Cada punto lleva su valor en el `title`, que es lo
 * que aparece al pasar el mouse.
 */

/** El verde de la marca, de menos a más riesgo. Los perfiles son ordinales. */
const COLOR_PERFIL: Readonly<Record<string, string>> = {
  Conservador: '#223311',
  'Conservador & Moderado': '#41611C',
  Moderado: '#79A82D',
  'Moderado & Arriesgado': '#A9DA55',
  Arriesgado: '#C3ED74',
}

const ANCHO = 420
const ALTO = 250
const MARGEN = { arriba: 14, derecha: 14, abajo: 30, izquierda: 32 } as const

const UTIL = {
  ancho: ANCHO - MARGEN.izquierda - MARGEN.derecha,
  alto: ALTO - MARGEN.arriba - MARGEN.abajo,
} as const

export function GraficoBenchmark({ matriz }: { readonly matriz: Matriz }) {
  // Una clase que queda en cero en toda la matriz no merece una columna del
  // eje: agregaría una categoría para decir que no hay nada.
  const clases = ORDEN_CLASES.filter((clase) =>
    matriz.portafolios.some((p) => p.porClase[clase] / (p.totalUsd || 1) > 0.0005),
  )
  if (clases.length === 0) return null

  const mayor = Math.max(
    ...matriz.portafolios.flatMap((p) =>
      clases.map((clase) => p.porClase[clase] / (p.totalUsd || 1)),
    ),
  )
  // El techo sube de a diez puntos y deja uno de aire: una curva que toca el
  // borde superior parece cortada.
  const techo = Math.min(1, Math.max(0.1, (Math.floor(mayor * 10) + 2) / 10))

  const x = (indice: number) =>
    MARGEN.izquierda +
    (clases.length === 1 ? UTIL.ancho / 2 : (UTIL.ancho * indice) / (clases.length - 1))
  const y = (valor: number) => MARGEN.arriba + UTIL.alto * (1 - valor / techo)

  const marcas = Array.from({ length: Math.round(techo * 10) + 1 }, (_, i) => i / 10).filter(
    (v) => Math.round(v * 100) % 20 === 0,
  )

  return (
    <section className={estilos.bloque} aria-label="La matriz en un panel por monto">
      <div className={estilos.paneles}>
        {matriz.tickets.map((ticket) => (
          <figure key={ticket} className={estilos.panel}>
            <figcaption>Monto: {usdTabla(ticket)}</figcaption>

            <svg viewBox={`0 0 ${ANCHO} ${ALTO}`} role="img" className={estilos.lienzo}>
              <title>
                Composición del portafolio con un ticket de {usdTabla(ticket)} dólares
              </title>

              {marcas.map((valor) => (
                <g key={valor}>
                  <line
                    x1={MARGEN.izquierda}
                    y1={y(valor)}
                    x2={ANCHO - MARGEN.derecha}
                    y2={y(valor)}
                    className={estilos.rejilla}
                  />
                  <text x={MARGEN.izquierda - 7} y={y(valor) + 3.5} className={estilos.marcaY}>
                    {Math.round(valor * 100)}%
                  </text>
                </g>
              ))}

              {clases.map((clase, indice) => (
                <text key={clase} x={x(indice)} y={ALTO - 10} className={estilos.marcaX}>
                  {NOMBRE_CLASE_CORTO[clase]}
                </text>
              ))}

              {matriz.perfiles.map((perfil) => (
                <Curva
                  key={perfil}
                  perfil={perfil}
                  clases={clases}
                  ticket={ticket}
                  matriz={matriz}
                  x={x}
                  y={y}
                />
              ))}
            </svg>
          </figure>
        ))}
      </div>

      <ul className={estilos.leyenda}>
        {matriz.perfiles.map((perfil) => (
          <li key={perfil}>
            <span
              className={estilos.muestra}
              style={{ background: COLOR_PERFIL[perfil] ?? '#79A82D' }}
              aria-hidden="true"
            />
            {perfil}
          </li>
        ))}
      </ul>
    </section>
  )
}

interface CurvaProps {
  readonly perfil: Perfil
  readonly clases: readonly ClaseModelo[]
  readonly ticket: number
  readonly matriz: Matriz
  readonly x: (indice: number) => number
  readonly y: (valor: number) => number
}

function Curva({ perfil, clases, ticket, matriz, x, y }: CurvaProps) {
  const portafolio = matriz.portafolios.find(
    (p) => p.ticketUsd === ticket && p.perfil === perfil,
  )
  if (portafolio === undefined) return null

  const color = COLOR_PERFIL[perfil] ?? '#79A82D'
  const share = (clase: ClaseModelo) => portafolio.porClase[clase] / (portafolio.totalUsd || 1)
  const puntos = clases.map((clase, indice) => ({
    clase,
    valor: share(clase),
    cx: x(indice),
    cy: y(share(clase)),
  }))

  return (
    <g>
      <polyline
        points={puntos.map((p) => `${p.cx},${p.cy}`).join(' ')}
        fill="none"
        stroke={color}
        strokeWidth={2.1}
        strokeLinejoin="round"
        strokeLinecap="round"
      />
      {puntos.map((p) => (
        <circle key={p.clase} cx={p.cx} cy={p.cy} r={3.6} fill={color} className={estilos.punto}>
          <title>
            {perfil} · {NOMBRE_CLASE[p.clase]}: {pct1(p.valor)}
          </title>
        </circle>
      ))}
    </g>
  )
}
