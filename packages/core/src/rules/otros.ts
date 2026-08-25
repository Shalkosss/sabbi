/**
 * La clase Otros: Oro y BTC.
 *
 * Port del PASO PREVIO A de `AjustarPorPosicionesFijas` y del bloque
 * `ClaseOtros` de la macro v4.
 *
 * Otros es clase propia solo si su benchmark alcanza el ticket minimo. Si no
 * llega, deja de existir: su peso se suma a Mercados Privados y la clase no
 * imprime ninguna linea. En la v4 el umbral no es un numero propio sino el
 * mismo ticket minimo que decide si un ETF es ejecutable — es la misma
 * pregunta, y tenerla escrita dos veces era como se separaban.
 *
 * Hay un segundo momento en el que se puede plegar. Otros pudo pasar el ticket
 * con su benchmark original y quedar por debajo despues del reparto: si el
 * asesor clavo otra clase, el prorrateo recorta a las libres. Ahi tambien se
 * pliega, y por eso la decision se toma dos veces — antes y despues del
 * solver. Esa segunda vuelta solo mueve dinero entre Otros y Privados.
 */

const EPS = 1e-6
const TOL = 0.01

export const OTROS_BTC = 'BTC (IBIT)'
export const OTROS_ORO = 'Oro'

export interface LineaOtros {
  readonly instrumento: string
  readonly usd: number
}

/** `true` cuando la clase alcanza para abrirse con este monto. */
export const otrosAbre = (montoUsd: number, ticketMinimoUsd: number): boolean =>
  montoUsd > EPS && montoUsd >= ticketMinimoUsd - TOL

/**
 * Reparte el dinero nuevo de Otros entre sus instrumentos.
 *
 * @param pesos pesos por instrumento renormalizados dentro de la clase
 */
export function repartirOtros(
  montoUsd: number,
  pesos: Readonly<Record<string, number>>,
): LineaOtros[] {
  if (montoUsd <= EPS) return []

  const total = Object.values(pesos).reduce((acc, p) => acc + p, 0)
  if (total <= EPS) return [{ instrumento: OTROS_BTC, usd: montoUsd }]

  return Object.entries(pesos)
    .map(([instrumento, peso]) => ({ instrumento, usd: montoUsd * (peso / total) }))
    .filter((l) => l.usd > EPS)
    .sort((a, b) => b.usd - a.usd)
}
