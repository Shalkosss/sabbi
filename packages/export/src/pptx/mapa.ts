/**
 * De la propuesta a los tokens del deck.
 *
 * La plantilla nombra sus huecos por posicion — `s04.nombre3`, `s04.pct7` —
 * porque salieron de tokenizar un deck que ya existia, no de un modelo de
 * datos. Este modulo es el unico lugar donde esa numeracion se cruza con el
 * dominio; el resto del paquete no sabe que significa ningun token.
 *
 * Lo que la propuesta no puede sostener no se inventa: se deja fuera del
 * diccionario y el rellenador lo vacia. Un deck con un hueco en blanco es
 * corregible; uno con una cifra plausible y falsa, no.
 */
import type { Propuesta } from '@sabbi/core'

import { fecha, monto, pct } from './formato.js'
import type { Sustituciones } from './rellenar.js'

export interface ContextoDeck {
  /** La fecha del informe. Se recibe: este paquete no mira el reloj. */
  readonly emitido: Date
}

/** Cuantas clases entran en el grafico de barras de la lamina 4. */
const CLASES_EN_GRAFICO = 6

/**
 * Portada: fecha y nombre del cliente.
 */
function lamina1(propuesta: Propuesta, contexto: ContextoDeck): Sustituciones {
  return {
    's01.fecha': fecha(contexto.emitido),
    's01.nombre': propuesta.cliente.nombre,
  }
}

/**
 * "Asi esta parado tu dinero hoy": totales y distribucion por asset class.
 *
 * `Patrimonio total` suma lo financiero y lo de uso propio — es el patrimonio
 * del cliente, no su portafolio. `Invertido` es solo la seccion 1, que es
 * sobre lo que el motor decide.
 *
 * Los tokens `pct7`..`pct12` son la segunda serie del grafico, la del
 * portafolio objetivo. Quedan sin mapear a proposito: la seccion 3 clasifica
 * por `assetClass` y la seccion 6 por `ClaseModelo`, que son taxonomias
 * distintas, y cruzarlas a ojo produciria un grafico que no cuadra con la
 * lamina de portafolio objetivo. Necesita una tabla de equivalencia acordada
 * con Sabbi antes de poder afirmarse.
 */
function lamina4(propuesta: Propuesta): Sustituciones {
  const invertido = propuesta.seccion1.totalUsd
  const usoPropio = propuesta.seccion2.totalUsd

  const valores: Record<string, string> = {
    's04.monto': monto(invertido + usoPropio),
    's04.monto2': monto(invertido),
    's04.nombre': propuesta.cliente.perfil,
  }

  const clases = [...propuesta.seccion3.filas]
    .sort((a, b) => b.valorUsd - a.valorUsd)
    .slice(0, CLASES_EN_GRAFICO)

  clases.forEach((fila, i) => {
    // La plantilla numera desde `nombre3` y desde `pct` sin sufijo.
    const etiqueta = `s04.nombre${i + 3}`
    const porcentaje = i === 0 ? 's04.pct' : `s04.pct${i + 1}`

    valores[etiqueta] = fila.assetClass
    valores[porcentaje] = pct(fila.share)
  })

  return valores
}

/** Slots de venta y de compra que la lamina 10 dibuja. Son fijos en el diseno. */
const FILAS_EN_PLAN = 3

/**
 * "Tu plan: que mover, cuanto y a donde". El blotter, resumido.
 *
 * La lamina tiene tres filas por lado y el blotter trae las que trae, asi que
 * se muestran las mayores por monto. No es una lista completa y no pretende
 * serlo: el detalle instrumento por instrumento es el anexo de las laminas 20
 * a 22.
 *
 * Quedan sin mapear los tokens `pct4`..`pct6` —una segunda cifra por fila que
 * podria ser retorno esperado o peso sobre el total, y el diseno no lo aclara—
 * y `conteo`, que por formato (`y N mas`) parece un contador de excedente pero
 * cuelga de la etiqueta "Liquidez por ingresar". Se confirman con Sabbi antes
 * de afirmarlos.
 */
function lamina10(propuesta: Propuesta): Sustituciones {
  const { ventas, compras, totalVentasUsd, totalComprasUsd } = propuesta.seccion7

  const valores: Record<string, string> = {
    's10.monto': monto(totalVentasUsd),
  }

  // Los montos de venta van en la columna derecha del bloque: 2, 4 y 6.
  const mayores = <T extends { readonly usd: number }>(lineas: readonly T[]) =>
    [...lineas].sort((a, b) => b.usd - a.usd).slice(0, FILAS_EN_PLAN)

  mayores(ventas).forEach((linea, i) => {
    valores[i === 0 ? 's10.nombre' : `s10.nombre${i + 1}`] = linea.instrumento
    valores[`s10.monto${2 * i + 2}`] = monto(linea.usd)
  })

  mayores(compras).forEach((linea, i) => {
    valores[`s10.nombre${i + 5}`] = linea.instrumento
    valores[`s10.monto${i + 7}`] = monto(linea.usd)

    if (totalComprasUsd > 0) {
      valores[i === 0 ? 's10.pct' : `s10.pct${i + 1}`] = pct(linea.usd / totalComprasUsd)
    }
  })

  return valores
}

/**
 * Todos los tokens que la propuesta puede sostener hoy.
 *
 * Las laminas 5 a 22 todavia no estan aca: piden diagnostico por score,
 * comisiones y comparativos antes/despues que el motor no calcula. Van a medida
 * que el dominio las pueda alimentar.
 */
export function tokensDePropuesta(
  propuesta: Propuesta,
  contexto: ContextoDeck,
): Sustituciones {
  return {
    ...lamina1(propuesta, contexto),
    ...lamina4(propuesta),
    ...lamina10(propuesta),
  }
}
