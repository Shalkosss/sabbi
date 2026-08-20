import { NOMBRE_CLASE } from '@sabbi/core'
import type { Propuesta } from '@sabbi/core'

import { rangoPct, usd } from '../rediseno/formato.js'
import type { FilaNueva } from './tabla.js'

/**
 * El anexo del deck replica: cada instrumento del objetivo, en su fila.
 *
 * La plantilla lo trae en tres laminas (20 a 22) porque el cliente de
 * referencia tenia esa cantidad de instrumentos. Son la misma lamina tres
 * veces, asi que aca se arma una sola tabla y el renderizador saca la lamina 20
 * tantas veces como paginas hagan falta.
 *
 * Seis columnas y cuatro origenes distintos, que conviene no mezclar:
 *
 *  - Instrumento y monto los imprime el motor.
 *  - El retorno esperado sale del catalogo, emparejado por nombre.
 *  - El plazo minimo sale del catalogo tambien, del campo de liquidez.
 *  - Descripcion y proposito los escribe el asesor en la propuesta. No hay de
 *    donde sacarlos: dependen del cliente y de la conversacion que tuvo con el.
 *
 * Lo que nadie lleno sale vacio. Una celda en blanco en un anexo se nota y se
 * corrige; una celda con algo inventado, no.
 */

/** Las tres formas de fila que la lamina 20 trae dibujadas. */
export const MODELO = {
  cabecera: 0,
  clase: 1,
  instrumento: 4,
} as const

export const CABECERA: FilaNueva = {
  modelo: MODELO.cabecera,
  celdas: ['Instrumento', 'Descripción', 'Monto', 'Retorno est.', 'Propósito', 'Plazo mín.'],
}

/** Las filas del anexo, en el orden de clases del motor. */
export function filasDelAnexo(propuesta: Propuesta): readonly FilaNueva[] {
  return propuesta.seccion6.grupos.flatMap((grupo): FilaNueva[] => {
    if (grupo.lineas.length === 0) return []

    return [
      { modelo: MODELO.clase, celdas: [NOMBRE_CLASE[grupo.clase]] },
      ...grupo.lineas.map(
        (linea): FilaNueva => ({
          modelo: MODELO.instrumento,
          celdas: [
            linea.instrumento,
            linea.descripcion,
            usd(linea.usd),
            linea.retornoTotal === null ? '' : rangoPct(linea.retornoTotal),
            linea.proposito,
            linea.liquidez ?? '',
          ],
        }),
      ),
    ]
  })
}

/** Cuantas celdas del anexo esperan a que alguien las escriba. */
export function sinEscribir(propuesta: Propuesta): number {
  return propuesta.seccion6.grupos
    .flatMap((grupo) => grupo.lineas)
    .reduce(
      (acc, linea) =>
        acc + (linea.descripcion.trim() === '' ? 1 : 0) + (linea.proposito.trim() === '' ? 1 : 0),
      0,
    )
}
