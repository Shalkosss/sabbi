/**
 * Que impide publicar una propuesta.
 *
 * Publicar es lo contrario de calcular. Todo lo demas en esta herramienta se
 * deriva en cada lectura — se corrige la ficha y la cifra se mueve, se guarda
 * una macro nueva y se mueven todas —, y eso es lo que la mesa quiere mientras
 * la propuesta se trabaja. Publicada es lo que salio hacia el cliente: a
 * partir de ahi la cifra no se puede mover, porque alguien la tiene impresa.
 *
 * Por eso el corte se hace una sola vez y con la propuesta delante. Estos
 * reparos son los mismos dos cuadres que ya calcula `armarPropuesta` — el
 * objetivo contra el patrimonio financiero y las compras contra las ventas —
 * mas lo que no se puede mandar a un cliente aunque cuadre: un objetivo vacio,
 * o dinero sobre el que nadie decidio nada.
 *
 * Se leen del objeto `Propuesta` y de nada mas. Un control que necesitara
 * volver a la base seria un tercer camino hacia las mismas cifras.
 */

import type { Propuesta } from './tipos.js'

/** Un centavo. Debajo de eso, un cuadre es ruido de coma flotante. */
export const TOLERANCIA_CUADRE = 0.01

export type CodigoReparo =
  | 'cuadre_objetivo'
  | 'cuadre_blotter'
  | 'objetivo_vacio'
  | 'sin_decidir'

export interface ReparoPublicacion {
  readonly codigo: CodigoReparo
  readonly mensaje: string
}

const usd = (monto: number): string =>
  monto.toLocaleString('es-PE', { maximumFractionDigits: 2, minimumFractionDigits: 2 })

/**
 * Los reparos que hay que resolver antes de publicar. Vacio quiere decir que
 * la propuesta se puede congelar tal como esta.
 */
export function reparosParaPublicar(propuesta: Propuesta): readonly ReparoPublicacion[] {
  const reparos: ReparoPublicacion[] = []

  const lineas = propuesta.seccion6.grupos.reduce(
    (total, grupo) => total + grupo.lineas.length,
    0,
  )
  if (lineas === 0) {
    reparos.push({
      codigo: 'objetivo_vacio',
      mensaje: 'El portafolio objetivo no tiene ninguna linea. No hay nada que publicar.',
    })
  }

  const cuadreObjetivo = propuesta.seccion6.cuadreUsd
  if (Math.abs(cuadreObjetivo) > TOLERANCIA_CUADRE) {
    reparos.push({
      codigo: 'cuadre_objetivo',
      mensaje:
        `El portafolio objetivo no cuadra contra el patrimonio financiero: ${usd(cuadreObjetivo)} ` +
        'de diferencia. Revisá el toggle de inmuebles de renta y los ajustes de clase.',
    })
  }

  const cuadreBlotter = propuesta.seccion7.cuadreUsd
  if (Math.abs(cuadreBlotter) > TOLERANCIA_CUADRE) {
    reparos.push({
      codigo: 'cuadre_blotter',
      mensaje:
        `Las compras no cuadran contra las ventas: ${usd(cuadreBlotter)} de diferencia. ` +
        'Ese descuadre es el que la mesa ejecuta, así que la propuesta no sale así.',
    })
  }

  // `sin_marcar` no es un estado neutro: el motor lo trata como conservar y el
  // dinero se queda donde esta. Mientras la propuesta es un borrador eso esta
  // bien —el asesor todavia no llego a esa fila—, pero publicarla convierte la
  // omision en una decision que nadie tomo.
  const sinDecidir = propuesta.seccion4.filas.find((fila) => fila.categoria === 'sin_marcar')
  if (sinDecidir !== undefined && sinDecidir.valorUsd > 0) {
    reparos.push({
      codigo: 'sin_decidir',
      mensaje:
        `Hay ${usd(sinDecidir.valorUsd)} USD en posiciones sin marcar. El motor las conserva, ` +
        'pero eso no es una decisión: marcá cada una en la revisión antes de publicar.',
    })
  }

  return reparos
}

/** Atajo para quien solo necesita el si o el no. */
export const sePuedePublicar = (propuesta: Propuesta): boolean =>
  reparosParaPublicar(propuesta).length === 0
