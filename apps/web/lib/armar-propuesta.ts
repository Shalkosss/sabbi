import 'server-only'

import { benchmarkDe, pesosDeClase, pesosPrivadosDe } from '@sabbi/config'
import { armarEntradaPlan, armarPropuesta, generarPlan } from '@sabbi/core'
import type { Bloqueo, PosicionPropuesta, Propuesta } from '@sabbi/core'

import { FALLBACKS } from './catalogo'
import { emparejarCatalogo } from './datos/emparejar'
import type { ProductoCatalogo } from './datos/emparejar'
import type { EstadoRevision } from './estado'

/**
 * De la revisión guardada a la propuesta.
 *
 * Corre solo en el servidor, por la misma razón que el cálculo del plan: los
 * pesos de benchmark son el modelo Sabbi y no viajan al navegador. Lo que baja
 * a la página son las siete secciones ya resueltas.
 *
 * El modelo puro es el mismo motor corrido sin pisos: el benchmark aplicado al
 * patrimonio entero ignorando lo que el cliente ya tiene. Sin esa segunda
 * corrida no hay forma de explicar por qué el plan se desvía del modelo.
 */

export type ResultadoPropuesta =
  | { readonly ok: true; readonly propuesta: Propuesta }
  | { readonly ok: false; readonly bloqueos: readonly Bloqueo[] }

interface Opciones {
  readonly mandato: string | null
  readonly catalogo: readonly ProductoCatalogo[]
  readonly assetClassCatalogo: readonly string[]
}

/** La revisión trae más campos de los que el motor mira; acá se completan. */
const aPropuesta = (posicion: EstadoRevision['posiciones'][number]): PosicionPropuesta => ({
  orden: posicion.orden,
  institucionProducto: posicion.institucionProducto,
  origen: posicion.origen,
  tipoFicha: posicion.tipoFicha,
  assetClass: posicion.assetClass,
  claseModelo: posicion.claseModelo,
  productoId: posicion.productoId,
  moneda: posicion.moneda,
  plaza: posicion.plaza,
  valorUsd: posicion.valorUsd,
  valorDeclaradoUsd: posicion.valorDeclaradoUsd,
  pctPertenencia: posicion.pctPertenencia,
  pais: posicion.pais,
  uso: posicion.uso,
  rendimientoEst: posicion.rendimientoEst,
  nota: posicion.nota,
  esInvertible: posicion.esInvertible,
  cta: posicion.cta,
  montoVentaParcial: posicion.montoVentaParcial,
})

export function construirPropuesta(
  revision: EstadoRevision,
  opciones: Opciones,
): ResultadoPropuesta {
  const { parametros } = revision
  const posiciones = revision.posiciones.map(aPropuesta)
  const benchmark = benchmarkDe(parametros.perfil)

  const derivacion = armarEntradaPlan(posiciones, {
    perfil: parametros.perfil,
    benchmark,
    pesos: {
      fijo: pesosDeClase('fijo', parametros.perfil),
      variable: pesosDeClase('variable', parametros.perfil),
      privados: pesosPrivadosDe(parametros.perfil),
    },
    ticketMinimoUsd: parametros.ticketMinimoUsd,
    fallbacks: FALLBACKS,
    usPerson: parametros.usPerson,
    necesitaFlujos: parametros.necesitaFlujos,
    institucional: parametros.institucional,
    incluirInmueblesDeRenta: parametros.incluirInmueblesDeRenta,
    colchonLiquidezUsd: parametros.colchonLiquidezUsd,
  })

  if (!derivacion.ok) return { ok: false, bloqueos: derivacion.bloqueos }

  // El catalogo se empareja contra los nombres que el motor acaba de imprimir,
  // no contra los del benchmark: son dos espacios de nombres distintos.
  const plan = generarPlan(derivacion.entrada)
  const catalogo = emparejarCatalogo(
    plan.lineas.map((linea) => linea.instrumento),
    opciones.catalogo,
  )

  const propuesta = armarPropuesta({
    cliente: {
      nombre: revision.cliente.nombre ?? 'Cliente sin nombre en la ficha',
      perfil: parametros.perfil,
      mandato: opciones.mandato,
    },
    posiciones,
    plan,
    modeloPuro: generarPlan({ ...derivacion.entrada, pisos: [] }),
    pisos: derivacion.entrada.pisos,
    benchmark: derivacion.entrada.benchmark,
    parametros: {
      ticketMinimoUsd: parametros.ticketMinimoUsd,
      colchonLiquidezUsd: parametros.colchonLiquidezUsd,
      fxPenUsd: parametros.fxPenUsd,
    },
    catalogo,
    assetClassCatalogo: opciones.assetClassCatalogo,
  })

  return {
    ok: true,
    propuesta: { ...propuesta, avisos: [...derivacion.avisos, ...propuesta.avisos] },
  }
}
