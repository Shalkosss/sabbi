/**
 * La propuesta completa, en un objeto.
 *
 * Junta las siete secciones y agrega los dos controles que deciden si la
 * propuesta se puede publicar: el objetivo tiene que cuadrar contra el
 * patrimonio financiero, y las compras contra las ventas. Los dos se calculan
 * aca, no en la vista, porque el Excel y los decks tienen que leer el mismo
 * numero.
 */

import {
  armarSeccion1,
  armarSeccion2,
  armarSeccion3,
  armarSeccion4,
  armarSeccion5,
} from './foto.js'
import {
  armarComparativo,
  armarCompras,
  armarGrupos,
  armarParametros,
  armarVentas,
} from './objetivo.js'
import type { DatosProducto, EntradaPropuesta, Propuesta } from './tipos.js'
import { armarComparativa, armarVistaHoy } from './vistas.js'

/** Un centavo. Debajo de eso, un cuadre es ruido de coma flotante. */
export const TOLERANCIA_CUADRE = 0.01

const SIN_CATALOGO: ReadonlyMap<string, DatosProducto> = new Map()

export function armarPropuesta(entrada: EntradaPropuesta): Propuesta {
  const { cliente, posiciones, plan, modeloPuro, pisos, benchmark, parametros } = entrada
  const catalogo = entrada.catalogo ?? SIN_CATALOGO

  const seccion1 = armarSeccion1(posiciones)
  const seccion2 = armarSeccion2(posiciones)
  const seccion3 = armarSeccion3(posiciones, entrada.assetClassCatalogo)
  const seccion4 = armarSeccion4(posiciones)
  const seccion5 = armarSeccion5(posiciones)

  const grupos = armarGrupos(plan, pisos, catalogo)
  const comparativo = armarComparativo(plan, modeloPuro)
  const cuadreObjetivo = plan.totalObjetivoUsd - seccion1.totalUsd

  const ventas = armarVentas(posiciones)
  const compras = armarCompras(plan, pisos)
  const totalVentasUsd = ventas.reduce((acc, venta) => acc + venta.usd, 0)
  const totalComprasUsd = compras.reduce((acc, compra) => acc + compra.usd, 0)
  const cuadreBlotter = totalComprasUsd - totalVentasUsd

  const avisos = [...plan.avisos]
  if (Math.abs(cuadreObjetivo) > TOLERANCIA_CUADRE) {
    avisos.push(
      `El portafolio objetivo no cuadra contra el patrimonio financiero: ${cuadreObjetivo.toFixed(2)} de diferencia.`,
    )
  }
  if (Math.abs(cuadreBlotter) > TOLERANCIA_CUADRE) {
    avisos.push(
      `Las compras no cuadran contra las ventas: ${cuadreBlotter.toFixed(2)} de diferencia. La propuesta no se puede publicar asi.`,
    )
  }

  return {
    cliente,
    vistaHoy: armarVistaHoy(posiciones),
    comparativa: armarComparativa(posiciones, plan, catalogo),
    seccion1,
    seccion2,
    seccion3,
    seccion4,
    seccion5,
    seccion6: {
      parametros: armarParametros(plan, parametros, benchmark.inm),
      grupos,
      comparativo,
      totalUsd: plan.totalObjetivoUsd,
      cuadreUsd: cuadreObjetivo,
    },
    seccion7: {
      ventas,
      compras,
      totalVentasUsd,
      totalComprasUsd,
      cuadreUsd: cuadreBlotter,
    },
    avisos,
  }
}

export * from './tipos.js'
export { SIN_CLASIFICAR, seConservaUsd, seVendeUsd } from './foto.js'
export { armarVistaHoy, armarComparativa, SUBCLASE_SIN_DATO } from './vistas.js'
export type {
  FilaComparativa,
  FilaVistaClase,
  RentabilidadPonderada,
  SubfilaVista,
  VistaComparativa,
  VistaHoy,
} from './vistas.js'
