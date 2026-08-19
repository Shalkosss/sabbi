import 'server-only'

import { clienteServidor } from '../supabase/servidor'

/**
 * Lectura del catálogo de productos.
 *
 * Todo sale de la vista `catalogo_productos`, que ya trae la composición
 * armada: sin ella la pantalla haría cuatro consultas por producto. Las listas
 * de validación se leen aparte porque las usa el formulario, no la tabla.
 */

export interface Parte {
  readonly nombre: string
  readonly pct: number
}

export interface ProductoEnCatalogo {
  readonly id: string
  readonly nombre: string
  readonly clase: string | null
  readonly moneda: string | null
  readonly liquidez: string | null
  readonly comisionPct: number | null
  readonly retMin: number | null
  readonly retMax: number | null
  readonly minTicket: number | null
  readonly ofrecer: boolean
  readonly esProductoSabbi: boolean
  readonly subidoACircle: boolean
  readonly gestor: string | null
  readonly gestorScore: number | null
  readonly administrador: string | null
  readonly administradorScore: number | null
  readonly focoGeografico: readonly Parte[]
  readonly claseActivo: readonly Parte[]
  readonly subyacentes: readonly Parte[]
}

export interface ListasCatalogo {
  readonly clasesActivo: readonly string[]
  readonly regiones: readonly string[]
  readonly subyacentes: readonly { readonly nombre: string; readonly claseActivo: string }[]
  readonly gestores: readonly { readonly nombre: string; readonly score: number | null }[]
  readonly administradores: readonly { readonly nombre: string; readonly score: number | null }[]
}

interface FilaVista {
  id: string
  nombre: string
  clase: string | null
  moneda: string | null
  liquidez: string | null
  comision_pct: number | null
  ret_min: number | null
  ret_max: number | null
  min_ticket: number | null
  ofrecer: boolean
  es_producto_sabbi: boolean
  subido_a_circle: boolean
  gestor_nombre: string | null
  gestor_score: number | null
  administrador_nombre: string | null
  administrador_score: number | null
  foco_geografico: Parte[] | null
  clase_activo: Parte[] | null
  subyacentes: Parte[] | null
}

const deFila = (fila: FilaVista): ProductoEnCatalogo => ({
  id: fila.id,
  nombre: fila.nombre,
  clase: fila.clase,
  moneda: fila.moneda,
  liquidez: fila.liquidez,
  comisionPct: fila.comision_pct,
  retMin: fila.ret_min,
  retMax: fila.ret_max,
  minTicket: fila.min_ticket,
  ofrecer: fila.ofrecer,
  esProductoSabbi: fila.es_producto_sabbi,
  subidoACircle: fila.subido_a_circle,
  gestor: fila.gestor_nombre,
  gestorScore: fila.gestor_score,
  administrador: fila.administrador_nombre,
  administradorScore: fila.administrador_score,
  focoGeografico: fila.foco_geografico ?? [],
  claseActivo: fila.clase_activo ?? [],
  subyacentes: fila.subyacentes ?? [],
})

export async function listarCatalogo(): Promise<readonly ProductoEnCatalogo[]> {
  const supabase = await clienteServidor()

  const { data } = await supabase
    .from('catalogo_productos')
    .select('*')
    .order('nombre', { ascending: true })

  return ((data ?? []) as FilaVista[]).map(deFila)
}

export async function listasDeValidacion(): Promise<ListasCatalogo> {
  const supabase = await clienteServidor()

  const [clases, regiones, subyacentes, gestores, administradores] = await Promise.all([
    supabase.from('clases_activo').select('nombre, orden').order('orden'),
    supabase.from('regiones').select('nombre, orden').order('orden'),
    supabase.from('subyacentes').select('nombre, clase_activo').order('nombre'),
    supabase.from('gestores').select('nombre, score').order('nombre'),
    supabase.from('administradores').select('nombre, score').order('nombre'),
  ])

  return {
    clasesActivo: (clases.data ?? []).map((f) => (f as { nombre: string }).nombre),
    regiones: (regiones.data ?? []).map((f) => (f as { nombre: string }).nombre),
    subyacentes: (subyacentes.data ?? []).map((f) => {
      const fila = f as { nombre: string; clase_activo: string }
      return { nombre: fila.nombre, claseActivo: fila.clase_activo }
    }),
    gestores: (gestores.data ?? []) as ListasCatalogo['gestores'],
    administradores: (administradores.data ?? []) as ListasCatalogo['administradores'],
  }
}

/** Productos cuya composición no suma 100%: la lista de trabajo de la mesa. */
export async function idsDescuadrados(): Promise<ReadonlySet<string>> {
  const supabase = await clienteServidor()
  const { data } = await supabase.from('productos_descuadrados').select('id')
  return new Set((data ?? []).map((f) => (f as { id: string }).id))
}
