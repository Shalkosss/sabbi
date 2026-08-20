/**
 * El anexo "¿En que exactamente va mi dinero?" — laminas 20 a 22.
 *
 * Una tabla con el portafolio objetivo, instrumento por instrumento, agrupado
 * por clase. Sale entero de la seccion 6, que ya agrupa por `ClaseModelo`, asi
 * que no necesita el puente con `assetClass` que si bloquea las laminas 11-16.
 */
import type { ClaseModelo, Propuesta } from '@sabbi/core'

import { monto, rangoPct } from './formato.js'

/** Las laminas del anexo, en el orden en que se llenan. */
export const LAMINAS_ANEXO = [20, 21, 22] as const

/**
 * Filas de contenido por lamina.
 *
 * Seis es lo que entra sin que la tabla se desborde del alto de la lamina: la
 * plantilla original trae siete filas en la 20 contando el encabezado de
 * columnas, que no se pagina porque se repite en cada una.
 */
export const FILAS_POR_LAMINA = 6

/** El nombre que el cliente lee. `ClaseModelo` es vocabulario del motor. */
const ETIQUETA: Readonly<Record<ClaseModelo, string>> = {
  fijo: 'Renta Fija',
  variable: 'Renta Variable',
  privados: 'Mercados Privados',
  inm: 'Inmobiliario',
  cash: 'Liquidez',
}

export interface FilaAnexo {
  readonly tipo: 'grupo' | 'dato'
  /** Valores por columna, en orden de aparicion en la fila molde. */
  readonly valores: readonly string[]
}

/**
 * Las columnas son: instrumento, descripcion, monto, retorno estimado,
 * proposito y plazo minimo.
 *
 * Proposito y plazo minimo van vacios: no estan en la propuesta. El plazo vive
 * en el catalogo (`products.liquidez`) y el proposito no existe en ningun
 * lado todavia. Se dejan en blanco antes que rellenarlos con algo parecido.
 */
function filaDeLinea(
  instrumento: string,
  nota: string | null,
  usd: number,
  retorno: { readonly min: number; readonly max: number } | null,
): FilaAnexo {
  return {
    tipo: 'dato',
    valores: [
      instrumento,
      nota ?? '',
      monto(usd),
      retorno === null ? '' : rangoPct(retorno.min, retorno.max),
      '',
      '',
    ],
  }
}

/** El portafolio objetivo, aplanado a filas. Grupos vacios no se muestran. */
export function filasDelAnexo(propuesta: Propuesta): readonly FilaAnexo[] {
  const filas: FilaAnexo[] = []

  for (const grupo of propuesta.seccion6.grupos) {
    if (grupo.lineas.length === 0) continue

    filas.push({ tipo: 'grupo', valores: [ETIQUETA[grupo.clase]] })

    for (const linea of grupo.lineas) {
      filas.push(filaDeLinea(linea.instrumento, linea.nota, linea.usd, linea.retornoTotal))
    }
  }

  return filas
}

export interface PaginasAnexo {
  /** Filas que le tocan a cada lamina usada, en orden. */
  readonly paginas: readonly (readonly FilaAnexo[])[]
  /** Filas que no entraron en ninguna lamina. */
  readonly excedente: number
}

export function paginar(filas: readonly FilaAnexo[]): PaginasAnexo {
  const paginas: FilaAnexo[][] = []

  for (let i = 0; i < filas.length; i += FILAS_POR_LAMINA) {
    if (paginas.length === LAMINAS_ANEXO.length) {
      return { paginas, excedente: filas.length - i }
    }
    paginas.push([...filas.slice(i, i + FILAS_POR_LAMINA)])
  }

  return { paginas, excedente: 0 }
}
