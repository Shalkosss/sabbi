'use client'

import { useMemo, useState } from 'react'

import { partirMes } from '@sabbi/core'
import type { PuntoCrecimiento } from '@sabbi/core'

import { mesLargo, pctFondo } from '../../lib/formato'
import estilos from './CurvaFondo.module.css'

const ANCHO = 760
const ALTO_CURVA = 210
const ALTO_CAIDA = 62
const MARGEN = { arriba: 12, derecha: 14, abajo: 20, izquierda: 52 } as const

const UTIL = ANCHO - MARGEN.izquierda - MARGEN.derecha

interface Props {
  readonly puntos: readonly PuntoCrecimiento[]
  /** La curva de un indice para comparar, si la mesa eligio uno. */
  readonly referencia?: { readonly nombre: string; readonly puntos: readonly PuntoCrecimiento[] } | undefined
}

/**
 * La curva de crecimiento de un fondo, con su drawdown debajo.
 *
 * Es lo que treinta columnas de metricas no pueden decir. «12.4% anualizado a
 * 3Y» y «12.4% anualizado a 3Y» describen dos fondos que se vivieron
 * distinto: uno subio derecho y el otro perdio 20% en el medio y volvio. La
 * primera pregunta que hace un cliente cuando ve un numero bueno es como se
 * llego hasta ahi, y hasta ahora la unica respuesta era abrir el Excel.
 *
 * El eje vertical arranca donde arranca la serie, no en cero: una curva de
 * crecimiento medida desde cero es una linea plana pegada al techo. El de
 * abajo si arranca en cero, porque una caida es contra el maximo y ese maximo
 * es el cero de ese grafico.
 *
 * SVG a mano, como el resto de los graficos de la casa: son dos paths y unos
 * ejes, y traer una libreria de charts al bundle por eso seria pagar mucho por
 * poco.
 */
export function CurvaFondo({ puntos, referencia }: Props) {
  const [encima, setEncima] = useState<number | null>(null)

  const escala = useMemo(() => {
    if (puntos.length === 0) return null

    /* El eje X es el calendario, no la posicion en el arreglo: un fondo con
       seis meses sin cargar tiene que mostrar ese hueco como distancia. */
    const ordinal = (mes: string): number => {
      const p = partirMes(mes)
      return p === null ? 0 : p.anio * 12 + p.mes
    }

    const desde = ordinal(puntos[0]!.mes)
    const hasta = ordinal(puntos.at(-1)!.mes)
    const ancho = Math.max(1, hasta - desde)

    const indices = puntos.map((p) => p.indice)
    const referencias = referencia?.puntos.map((p) => p.indice) ?? []
    const techo = Math.max(...indices, ...referencias)
    const piso = Math.min(...indices, ...referencias)
    const holgura = (techo - piso) * 0.08 || 0.02

    const caidaMasHonda = Math.min(...puntos.map((p) => p.drawdown), -0.005)

    return {
      x: (mes: string) => MARGEN.izquierda + ((ordinal(mes) - desde) / ancho) * UTIL,
      y: (indice: number) =>
        MARGEN.arriba +
        (ALTO_CURVA - MARGEN.arriba - MARGEN.abajo) *
          (1 - (indice - piso + holgura) / (techo - piso + holgura * 2)),
      yCaida: (drawdown: number) => (drawdown / caidaMasHonda) * (ALTO_CAIDA - 16),
      techo,
      piso,
      caidaMasHonda,
      desde,
      hasta,
      ancho,
      ordinal,
    }
  }, [puntos, referencia])

  if (escala === null) {
    return <p className={estilos.vacio}>Este fondo todavía no tiene un solo mes cargado.</p>
  }

  const camino = (serie: readonly PuntoCrecimiento[]): string =>
    serie.map((p, i) => `${i === 0 ? 'M' : 'L'}${escala.x(p.mes)} ${escala.y(p.indice)}`).join(' ')

  const area = (serie: readonly PuntoCrecimiento[]): string => {
    const base = ALTO_CURVA - MARGEN.abajo
    return `${camino(serie)} L${escala.x(serie.at(-1)!.mes)} ${base} L${escala.x(serie[0]!.mes)} ${base} Z`
  }

  /*
   * Marcas de crecimiento acumulado, no de indice: «+38%» se lee, «1.38» hay
   * que traducirlo.
   *
   * Y en escalones redondos, no en cinco cortes iguales del rango. Repartir el
   * rango en cinco da ejes como «179.70% · 134.45% · 89.20%»: numeros que no
   * significan nada y que ademas cambian con cada mes que se carga, asi que el
   * grafico se lee distinto cada vez que alguien lo abre.
   */
  const marcas = marcasRedondas(escala.piso, escala.techo)

  /* Un rotulo por año, siempre que quepan. Con veinte años de serie se saltean. */
  const anios = [...new Set(puntos.map((p) => p.mes.slice(0, 4)))]
  const saltoAnios = Math.ceil(anios.length / 9)

  const activo = encima === null ? null : (puntos[encima] ?? null)

  /** El punto mas cercano a donde esta el cursor. */
  const alMover = (evento: React.MouseEvent<SVGSVGElement>) => {
    const caja = evento.currentTarget.getBoundingClientRect()
    const proporcion = (evento.clientX - caja.left) / caja.width
    const objetivo = escala.desde + proporcion * ANCHO * (escala.ancho / UTIL) - (MARGEN.izquierda * escala.ancho) / UTIL

    let mejor = 0
    let distancia = Infinity
    puntos.forEach((p, i) => {
      const d = Math.abs(escala.ordinal(p.mes) - objetivo)
      if (d < distancia) {
        distancia = d
        mejor = i
      }
    })
    setEncima(mejor)
  }

  const ultimo = puntos.at(-1)!

  return (
    <div className={estilos.marco}>
      <div className={estilos.lectura}>
        {activo === null ? (
          <>
            <span className={estilos.rotulo}>Acumulado desde el primer mes</span>
            <strong className={estilos.cifraGrande}>{pctFondo(ultimo.indice - 1)}</strong>
            <span className={estilos.rotulo}>
              {mesLargo(puntos[0]!.mes)} → {mesLargo(ultimo.mes)}
            </span>
          </>
        ) : (
          <>
            <span className={estilos.rotulo}>{mesLargo(activo.mes)}</span>
            <strong className={estilos.cifraGrande}>{pctFondo(activo.indice - 1)}</strong>
            <span className={estilos.rotulo}>
              mes {pctFondo(activo.retorno)} · desde el máximo {pctFondo(activo.drawdown)}
            </span>
          </>
        )}
      </div>

      <svg
        viewBox={`0 0 ${ANCHO} ${ALTO_CURVA + ALTO_CAIDA}`}
        className={estilos.grafico}
        role="img"
        aria-label={`Crecimiento acumulado de ${puntos.length} meses y su caída contra el máximo`}
        onMouseMove={alMover}
        onMouseLeave={() => setEncima(null)}
      >
        <defs>
          <linearGradient id="relleno-curva" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="var(--acento)" stopOpacity="0.22" />
            <stop offset="100%" stopColor="var(--acento)" stopOpacity="0" />
          </linearGradient>
        </defs>

        {marcas.map((indice) => (
          <g key={indice}>
            <line
              x1={MARGEN.izquierda}
              x2={ANCHO - MARGEN.derecha}
              y1={escala.y(indice)}
              y2={escala.y(indice)}
              className={Math.abs(indice - 1) < 1e-9 ? estilos.ejeCero : estilos.reja}
            />
            <text x={MARGEN.izquierda - 8} y={escala.y(indice) + 3.5} className={estilos.rotuloEje}>
              {pctFondo(indice - 1)}
            </text>
          </g>
        ))}

        {anios
          .filter((_, i) => i % saltoAnios === 0)
          .map((anio) => (
            <text
              key={anio}
              x={escala.x(`${anio}-06`)}
              y={ALTO_CURVA - 4}
              className={estilos.rotuloEje}
              textAnchor="middle"
            >
              {anio}
            </text>
          ))}

        <path d={area(puntos)} fill="url(#relleno-curva)" />

        {referencia !== undefined && referencia.puntos.length > 0 && (
          <path d={camino(referencia.puntos)} className={estilos.lineaReferencia} />
        )}

        <path d={camino(puntos)} className={estilos.linea} />

        {activo !== null && (
          <g>
            <line
              x1={escala.x(activo.mes)}
              x2={escala.x(activo.mes)}
              y1={MARGEN.arriba}
              y2={ALTO_CURVA - MARGEN.abajo}
              className={estilos.guia}
            />
            <circle
              cx={escala.x(activo.mes)}
              cy={escala.y(activo.indice)}
              r={4.5}
              className={estilos.marcador}
            />
          </g>
        )}

        {/*
          El drawdown va abajo y no superpuesto: son dos preguntas distintas
          —cuanto gano y cuanto llego a perder— y encimarlas obliga a elegir un
          eje que miente sobre una de las dos.
        */}
        <g transform={`translate(0 ${ALTO_CURVA})`}>
          <text x={MARGEN.izquierda - 8} y={10} className={estilos.rotuloEje}>
            0%
          </text>
          <text x={MARGEN.izquierda - 8} y={ALTO_CAIDA - 4} className={estilos.rotuloEje}>
            {pctFondo(escala.caidaMasHonda)}
          </text>
          <line
            x1={MARGEN.izquierda}
            x2={ANCHO - MARGEN.derecha}
            y1={6}
            y2={6}
            className={estilos.ejeCero}
          />
          <path
            d={`M${escala.x(puntos[0]!.mes)} 6 ${puntos
              .map((p) => `L${escala.x(p.mes)} ${6 + escala.yCaida(p.drawdown)}`)
              .join(' ')} L${escala.x(ultimo.mes)} 6 Z`}
            className={estilos.areaCaida}
          />
          {activo !== null && (
            <line
              x1={escala.x(activo.mes)}
              x2={escala.x(activo.mes)}
              y1={6}
              y2={ALTO_CAIDA - 6}
              className={estilos.guia}
            />
          )}
        </g>
      </svg>

      <div className={estilos.leyenda}>
        <span>
          <i className={estilos.muestraLinea} /> crecimiento acumulado
        </span>
        <span>
          <i className={estilos.muestraCaida} /> caída contra el máximo
        </span>
        {referencia !== undefined && (
          <span>
            <i className={estilos.muestraReferencia} /> {referencia.nombre}
          </span>
        )}
      </div>
    </div>
  )
}

/**
 * Los escalones redondos que cubren un rango.
 *
 * Toma el ancho que hay que cubrir, lo divide en unos cuatro tramos y redondea
 * ese paso al 1, 2, 2.5 o 5 mas cercano de su magnitud — la misma escalera que
 * usa cualquier eje que se pueda leer. Devuelve valores de indice, no de
 * crecimiento: quien dibuja ya sabe restarle uno.
 */
function marcasRedondas(piso: number, techo: number): readonly number[] {
  const rango = techo - piso
  if (rango <= 0) return [piso]

  const bruto = rango / 4
  const magnitud = 10 ** Math.floor(Math.log10(bruto))
  const normalizado = bruto / magnitud
  const paso =
    (normalizado >= 5 ? 5 : normalizado >= 2.5 ? 2.5 : normalizado >= 2 ? 2 : 1) * magnitud

  const marcas: number[] = []
  /* Se arranca en el primer escalon que entra y no en el piso: el piso es donde
     cae el dato, y clavar una marca ahi vuelve a dar un numero cualquiera. */
  for (let v = Math.ceil(piso / paso) * paso; v <= techo + 1e-9; v += paso) {
    marcas.push(Number(v.toFixed(10)))
  }

  return marcas.length === 0 ? [piso, techo] : marcas
}
