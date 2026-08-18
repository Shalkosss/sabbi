'use server'

import { benchmarkDe, pesosDeClase, pesosPrivadosDe } from '@sabbi/config'
import { armarEntradaPlan, generarPlan } from '@sabbi/core'
import type { Bloqueo, EstadoInstitucional, Perfil, PosicionRevisada } from '@sabbi/core'
import { parsearFicha } from '@sabbi/io'
import type { FichaParseada } from '@sabbi/io'

import { FALLBACKS } from '../lib/catalogo'

/**
 * Parseo de la ficha en el servidor.
 *
 * Corre aca y no en el navegador por dos razones: el archivo trae datos de un
 * cliente y no tiene por que pasear por el bundle, y el parser es codigo de
 * Node que no queremos duplicar en el cliente.
 */

/** Una ficha pesa unos pocos cientos de KB; 10 MB ya es otra cosa. */
const MAXIMO_BYTES = 10 * 1024 * 1024

export type ResultadoSubida =
  | { readonly ok: true; readonly ficha: FichaParseada; readonly archivo: string }
  | { readonly ok: false; readonly error: string }

export async function subirFicha(_previo: unknown, datos: FormData): Promise<ResultadoSubida> {
  const archivo = datos.get('ficha')

  if (!(archivo instanceof File) || archivo.size === 0) {
    return { ok: false, error: 'Elegí un archivo .xlsx para empezar.' }
  }
  if (!archivo.name.toLowerCase().endsWith('.xlsx')) {
    return {
      ok: false,
      error: `"${archivo.name}" no es un .xlsx. La ficha patrimonial es el libro de Excel que llena el cliente.`,
    }
  }
  if (archivo.size > MAXIMO_BYTES) {
    return { ok: false, error: 'El archivo pesa más de 10 MB. Revisá que sea la ficha y no otra cosa.' }
  }

  try {
    const bytes = new Uint8Array(await archivo.arrayBuffer())
    return { ok: true, ficha: parsearFicha(bytes), archivo: archivo.name }
  } catch (error) {
    const detalle = error instanceof Error ? error.message : 'error desconocido'
    return { ok: false, error: `No pude leer la ficha. ${detalle}` }
  }
}

/**
 * Cálculo del plan.
 *
 * Corre en el servidor por una razón de fondo: los pesos de benchmark son la
 * propiedad intelectual del modelo Sabbi y no tienen por qué viajar al
 * navegador. La pantalla manda posiciones y toggles, y recibe cifras.
 */
export type ResultadoCalculo =
  | { readonly ok: true; readonly plan: PlanResumido }
  | { readonly ok: false; readonly bloqueos: readonly Bloqueo[] }

export interface PlanResumido {
  readonly porClase: readonly {
    readonly clase: string
    readonly objetivoUsd: number
    readonly pisoUsd: number
    readonly dineroNuevoUsd: number
    readonly cerrada: boolean
  }[]
  readonly lineas: readonly { readonly instrumento: string; readonly clase: string; readonly usd: number }[]
  readonly totalObjetivoUsd: number
  readonly dineroNuevoUsd: number
  readonly baseRedistribucion: number
  readonly avisos: readonly string[]
}

export interface ParametrosCalculo {
  readonly perfil: Perfil
  readonly necesitaFlujos: boolean
  readonly usPerson: boolean
  readonly institucional: EstadoInstitucional
  readonly incluirInmueblesDeRenta: boolean
  readonly colchonLiquidezUsd: number
  readonly ticketMinimoUsd: number
}

export async function calcularPlan(
  posiciones: readonly PosicionRevisada[],
  parametros: ParametrosCalculo,
): Promise<ResultadoCalculo> {
  const derivacion = armarEntradaPlan(posiciones, {
    perfil: parametros.perfil,
    benchmark: benchmarkDe(parametros.perfil),
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

  const plan = generarPlan(derivacion.entrada)

  return {
    ok: true,
    plan: {
      porClase: plan.reparto.porClase.map((clase) => ({
        clase: clase.clase,
        objetivoUsd: clase.objetivoUsd,
        pisoUsd: clase.pisoUsd,
        dineroNuevoUsd: clase.dineroNuevoUsd,
        cerrada: clase.cerrada,
      })),
      lineas: plan.lineas.map((linea) => ({
        instrumento: linea.instrumento,
        clase: linea.clase,
        usd: linea.usd,
      })),
      totalObjetivoUsd: plan.totalObjetivoUsd,
      dineroNuevoUsd: plan.dineroNuevoUsd,
      baseRedistribucion: plan.reparto.baseRedistribucion,
      avisos: [...derivacion.avisos, ...plan.avisos],
    },
  }
}
