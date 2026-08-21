import type { ClaseModelo, Perfil } from '@sabbi/core'

import type { Matriz, Portafolio } from '../lib/benchmark'
import { PERFILES_PARA_ROTULAR } from '../lib/benchmark'
import { NOMBRE_CLASE, NOMBRE_CLASE_CORTO, ORDEN_CLASES } from '../lib/clases'
import { pct1, usdTabla } from '../lib/formato'
import { colorPerfil } from '../lib/perfiles'
import estilos from './GraficoBenchmark.module.css'

/**
 * La matriz, en un panel por monto.
 *
 * Las columnas de abajo dicen los números; esto dice la forma. Dónde tiene su
 * pico cada perfil y cómo se mueve ese pico cuando cambia el monto es lo que
 * hay que mirar para juzgar una regla, y eso en cuatro columnas de cifras hay
 * que reconstruirlo con la vista.
 *
 * Sale de los mismos portafolios que las columnas —el mismo `porClase`, el
 * mismo total— y no de una segunda cuenta. Si el gráfico y la tabla pudieran
 * discrepar, uno de los dos estaría mintiendo y no habría forma de saber cuál.
 *
 * Es SVG escrito a mano y no una librería de gráficos. La forma es simple
 * —unos puntos y una línea por perfil— y traerse trescientos kilobytes de
 * JavaScript al navegador para dibujarla sería pagar mucho por poco. Además
 * sale del servidor ya dibujado: no parpadea ni espera a hidratar.
 *
 * Las cifras sobre los puntos aparecen solas cuando hay menos de tres perfiles
 * puestos. Con tres o más, tres etiquetas caen en el mismo lugar y se tapan
 * entre ellas; con dos hay sitio, y ahí leer el valor sin bajar la vista a la
 * tabla es justamente lo que uno quiere. En todos los casos cada punto lleva
 * su valor en el `title`, que es lo que aparece al pasar el mouse.
 */

const ANCHO = 420
const ALTO = 250
const MARGEN = { arriba: 18, derecha: 14, abajo: 30, izquierda: 32 } as const

const UTIL = {
  ancho: ANCHO - MARGEN.izquierda - MARGEN.derecha,
  alto: ALTO - MARGEN.arriba - MARGEN.abajo,
} as const

export function GraficoBenchmark({ matriz }: { readonly matriz: Matriz }) {
  // Una clase que queda en cero en toda la matriz no merece una columna del
  // eje: agregaria una categoria para decir que no hay nada.
  const clases = ORDEN_CLASES.filter((clase) =>
    matriz.portafolios.some((p) => p.porClase[clase] / (p.totalUsd || 1) > 0.0005),
  )
  if (clases.length === 0) return null

  const rotular = matriz.perfiles.length < PERFILES_PARA_ROTULAR

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
                Composición del portafolio con un monto de {usdTabla(ticket)} dólares
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

              {matriz.perfiles.map((perfil, orden) => (
                <Curva
                  key={perfil}
                  perfil={perfil}
                  clases={clases}
                  ticket={ticket}
                  matriz={matriz}
                  x={x}
                  y={y}
                  rotular={rotular}
                  /* Con dos curvas, una etiqueta va arriba del punto y la otra
                     abajo. Es lo unico que evita que se pisen cuando los dos
                     perfiles coinciden en una clase, que pasa seguido. */
                  arriba={orden === 0}
                  suelo={MARGEN.arriba + UTIL.alto}
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
              style={{ background: colorPerfil(perfil) }}
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
  readonly rotular: boolean
  readonly arriba: boolean
  /** El borde inferior del area de dibujo, donde empiezan los nombres de clase. */
  readonly suelo: number
}

function Curva({ perfil, clases, ticket, matriz, x, y, rotular, arriba, suelo }: CurvaProps) {
  const portafolio = matriz.portafolios.find(
    (p) => p.ticketUsd === ticket && p.perfil === perfil,
  )
  if (portafolio === undefined) return null

  const color = colorPerfil(perfil)
  const puntos = clases.map((clase, indice) => {
    const valor = participacion(portafolio, clase)
    return { clase, valor, cx: x(indice), cy: y(valor) }
  })

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
        <g key={p.clase}>
          <circle cx={p.cx} cy={p.cy} r={3.6} fill={color} className={estilos.punto}>
            <title>
              {perfil} · {NOMBRE_CLASE[p.clase]}: {pct1(p.valor)}
            </title>
          </circle>
          {rotular && (
            <text x={p.cx} y={p.cy + desplazamiento(p.cy, arriba, suelo)} fill={color} className={estilos.rotulo}>
              {pct1(p.valor)}
            </text>
          )}
        </g>
      ))}
    </g>
  )
}

/**
 * Donde poner la cifra respecto de su punto.
 *
 * Una curva rotula arriba y la otra abajo, que es lo que las separa cuando los
 * dos perfiles coinciden en una clase. La excepcion es el fondo del panel: ahi
 * la etiqueta de abajo caeria encima de los nombres de clase del eje, asi que
 * sube — y para no aterrizar sobre la otra, sube un renglon mas.
 */
function desplazamiento(cy: number, arriba: boolean, suelo: number): number {
  if (arriba) return -8
  return cy > suelo - 14 ? -19 : 15
}

/** Lo que pesa una clase en el portafolio. La misma cuenta que la tabla. */
const participacion = (portafolio: Portafolio, clase: ClaseModelo): number =>
  portafolio.porClase[clase] / (portafolio.totalUsd || 1)
