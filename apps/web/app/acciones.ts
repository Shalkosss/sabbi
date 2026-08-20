'use server'

import { benchmarkDe, pesosDeClase } from '@sabbi/config'
import { armarEntradaPlan, generarPlan } from '@sabbi/core'
import type {
  AjusteClase,
  AnotacionLinea,
  Bloqueo,
  EstadoInstitucional,
  Perfil,
  PosicionRevisada,
  Restriccion,
} from '@sabbi/core'
import { parsearFicha } from '@sabbi/io'
import type { FichaParseada } from '@sabbi/io'

import { redirect } from 'next/navigation'

import { FALLBACKS } from '../lib/catalogo'
import { guardarActivoAgregado, guardarAjusteDeClase } from '../lib/datos/ajustes'
import { guardarFichaNueva } from '../lib/datos/fichas'
import { guardarAnotacion } from '../lib/datos/propuestas'
import { guardarParametros, guardarPosicion } from '../lib/datos/revision'
import type { Parametros, PosicionEditada } from '../lib/estado'

/**
 * Parseo de la ficha en el servidor.
 *
 * Corre aca y no en el navegador por dos razones: el archivo trae datos de un
 * cliente y no tiene por que pasear por el bundle, y el parser es codigo de
 * Node que no queremos duplicar en el cliente.
 */

/** Una ficha pesa unos pocos cientos de KB; 10 MB ya es otra cosa. */
const MAXIMO_BYTES = 10 * 1024 * 1024

export type ResultadoSubida = { readonly ok: false; readonly error: string } | null

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

  let ficha: FichaParseada
  try {
    ficha = parsearFicha(new Uint8Array(await archivo.arrayBuffer()))
  } catch (error) {
    const detalle = error instanceof Error ? error.message : 'error desconocido'
    return { ok: false, error: `No pude leer la ficha. ${detalle}` }
  }

  const guardada = await guardarFichaNueva(ficha, archivo.name)
  if ('error' in guardada) return { ok: false, error: guardada.error }

  // Se sale por redirect y no devolviendo la ficha: a partir de acá la verdad
  // vive en la base, y la pantalla la lee de ahí.
  redirect(`/fichas/${guardada.fichaId}`)
}

/** Autoguardado de una celda corregida. */
export async function guardarCambioPosicion(
  posicionId: string,
  cambios: Partial<PosicionEditada>,
): Promise<{ readonly error?: string }> {
  return guardarPosicion(posicionId, cambios)
}

/** Autoguardado de los parámetros de la propuesta. */
export async function guardarCambioParametros(
  propuestaId: string,
  clienteId: string,
  parametros: Parametros,
): Promise<{ readonly error?: string }> {
  return guardarParametros(propuestaId, clienteId, parametros)
}

/** Autoguardado de un activo agregado al portafolio objetivo. */
export async function guardarCambioActivo(
  propuestaId: string,
  activo: Restriccion,
  eliminado: boolean,
): Promise<{ readonly error?: string }> {
  return guardarActivoAgregado(propuestaId, activo, eliminado)
}

/** Autoguardado del monto que el asesor clavó en una clase. */
export async function guardarCambioAjuste(
  propuestaId: string,
  ajuste: AjusteClase,
  eliminado: boolean,
): Promise<{ readonly error?: string }> {
  return guardarAjusteDeClase(propuestaId, ajuste, eliminado)
}

/**
 * Autoguardado de lo que el asesor escribe sobre una línea del objetivo.
 *
 * Descripción y propósito son las dos columnas del anexo del deck que ningún
 * dato puede llenar: qué es el instrumento y para qué está en este portafolio.
 * Dependen del cliente y de la conversación, no del catálogo.
 */
export async function guardarCambioAnotacion(
  propuestaId: string,
  instrumento: string,
  anotacion: AnotacionLinea,
): Promise<{ readonly error?: string }> {
  return guardarAnotacion(propuestaId, instrumento, anotacion)
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
    readonly fijada: boolean
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
  /** Activos que el asesor sumó al objetivo. Clavan su parte del ticket. */
  readonly restricciones?: readonly Restriccion[]
  /** Montos clavados por clase. La única palanca que empuja hacia abajo. */
  readonly ajustes?: readonly AjusteClase[]
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
      otros: pesosDeClase('otros', parametros.perfil),
    },
    ticketMinimoUsd: parametros.ticketMinimoUsd,
    fallbacks: FALLBACKS,
    usPerson: parametros.usPerson,
    necesitaFlujos: parametros.necesitaFlujos,
    institucional: parametros.institucional,
    incluirInmueblesDeRenta: parametros.incluirInmueblesDeRenta,
    colchonLiquidezUsd: parametros.colchonLiquidezUsd,
    restricciones: parametros.restricciones ?? [],
    ajustes: parametros.ajustes ?? [],
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
        fijada: clase.fijada,
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
