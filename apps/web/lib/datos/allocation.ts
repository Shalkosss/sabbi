import 'server-only'

import type { ClaseAllocation, Reparto, SeriesPorClase } from '@sabbi/core'
import type { ObservacionMensual } from '@sabbi/core'

import { clienteServidor } from '../supabase/servidor'

/**
 * Lo que la pantalla de Allocation necesita de la base.
 *
 * Cuatro lecturas y ninguna cuenta: el reparto clásico de cada perfil, las
 * mezclas de alternativos, qué índice mide cada clase y las series de esos
 * índices. Todo lo que se calcula con eso vive en `@sabbi/core/allocation`,
 * que no sabe que Supabase existe.
 *
 * Las series se leen enteras y se cruzan acá: son ocho columnas de unos pocos
 * cientos de meses, no las cuatro mil observaciones del universo de fondos.
 */

export interface ClaseDeAllocation {
  readonly nombre: ClaseAllocation
  readonly esPublica: boolean
  readonly orden: number
}

export interface Mezcla {
  readonly nombre: string
  readonly pesos: Reparto
}

export interface Referencia {
  readonly clase: ClaseAllocation
  readonly indice: string
  /** Primer y último mes con retorno cargado, para poder decir qué falta. */
  readonly desde: string | null
  readonly hasta: string | null
  readonly meses: number
}

export interface DatosAllocation {
  readonly clases: readonly ClaseDeAllocation[]
  /** El reparto entre clases públicas de cada perfil. */
  readonly porPerfil: ReadonlyMap<string, Reparto>
  readonly mezclas: readonly Mezcla[]
  readonly series: SeriesPorClase
  readonly referencias: readonly Referencia[]
  /** Clases sin índice asignado. La pantalla las nombra en vez de calcular. */
  readonly sinReferencia: readonly ClaseAllocation[]
}

const VACIO: DatosAllocation = {
  clases: [],
  porPerfil: new Map(),
  mezclas: [],
  series: new Map(),
  referencias: [],
  sinReferencia: [],
}

export async function datosDeAllocation(): Promise<DatosAllocation> {
  const supabase = await clienteServidor()

  const [clases, perfiles, mezclas, pesos, referencias] = await Promise.all([
    supabase.from('allocation_clases').select('nombre, es_publica, orden').order('orden'),
    supabase.from('allocation_perfiles').select('perfil, clase, peso'),
    supabase.from('allocation_mezclas').select('nombre, orden').order('orden'),
    supabase.from('allocation_mezclas_pesos').select('mezcla, clase, peso'),
    supabase.from('allocation_referencias').select('clase, fondo_id, fondos (nombre)'),
  ])

  // La migración es nueva y puede no estar aplicada. Sin tablas no hay
  // pantalla, y decirlo vacío es mejor que reventar la ruta entera.
  if (clases.error !== null || clases.data === null) return VACIO

  const porPerfil = new Map<string, Map<ClaseAllocation, number>>()
  for (const fila of perfiles.data ?? []) {
    const suyo = porPerfil.get(fila.perfil) ?? new Map<ClaseAllocation, number>()
    suyo.set(fila.clase, Number(fila.peso))
    porPerfil.set(fila.perfil, suyo)
  }

  const porMezcla = new Map<string, Map<ClaseAllocation, number>>()
  for (const fila of pesos.data ?? []) {
    const suyo = porMezcla.get(fila.mezcla) ?? new Map<ClaseAllocation, number>()
    suyo.set(fila.clase, Number(fila.peso))
    porMezcla.set(fila.mezcla, suyo)
  }

  const indices = (referencias.data ?? []).map((fila) => ({
    clase: fila.clase as ClaseAllocation,
    fondoId: fila.fondo_id as number,
    // El embed de PostgREST llega como objeto o como arreglo según la relación.
    nombre: nombreDelFondo(fila.fondos),
  }))

  const series = new Map<ClaseAllocation, readonly ObservacionMensual[]>()
  const conCobertura: Referencia[] = []

  for (const indice of indices) {
    const { data } = await supabase
      .from('fondos_observaciones')
      .select('mes, retorno_total')
      .eq('fondo_id', indice.fondoId)
      .not('retorno_total', 'is', null)
      .order('mes')

    const observaciones: ObservacionMensual[] = (data ?? []).map((fila) => ({
      mes: fila.mes as string,
      nav: null,
      retornoTotal: Number(fila.retorno_total),
    }))

    series.set(indice.clase, observaciones)
    conCobertura.push({
      clase: indice.clase,
      indice: indice.nombre,
      desde: observaciones[0]?.mes ?? null,
      hasta: observaciones[observaciones.length - 1]?.mes ?? null,
      meses: observaciones.length,
    })
  }

  const conIndice = new Set(indices.map((i) => i.clase))

  return {
    clases: clases.data.map((fila) => ({
      nombre: fila.nombre as ClaseAllocation,
      esPublica: fila.es_publica as boolean,
      orden: fila.orden as number,
    })),
    porPerfil,
    mezclas: (mezclas.data ?? []).map((fila) => ({
      nombre: fila.nombre as string,
      pesos: porMezcla.get(fila.nombre as string) ?? new Map(),
    })),
    series,
    referencias: conCobertura.sort((a, b) => a.clase.localeCompare(b.clase)),
    sinReferencia: clases.data
      .map((fila) => fila.nombre as ClaseAllocation)
      .filter((clase) => !conIndice.has(clase)),
  }
}

function nombreDelFondo(embed: unknown): string {
  if (Array.isArray(embed)) return String((embed[0] as { nombre?: string })?.nombre ?? '—')
  if (embed !== null && typeof embed === 'object') {
    return String((embed as { nombre?: string }).nombre ?? '—')
  }
  return '—'
}
