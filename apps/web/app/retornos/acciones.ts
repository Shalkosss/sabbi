'use server'

import { revalidatePath } from 'next/cache'

import { partirMes } from '@sabbi/core'

import { clienteServidor } from '../../lib/supabase/servidor'

/**
 * Escritura de los retornos de fondos.
 *
 * Lo unico que se guarda es lo que alguien tecleo: el fondo, su observacion
 * del mes y el Treasury. Ninguna metrica. Si alguna vez aparece un `insert`
 * de un retorno de 1Y en este archivo, es un bug: esa cifra se calcula al
 * leer y guardarla la desincroniza en cuanto se corrija un NAV viejo.
 */

export type Resultado =
  | { readonly ok: true; readonly guardadas: number }
  | { readonly ok: false; readonly error: string }

export interface ObservacionEntrada {
  readonly fondoId: number
  readonly nav: number | null
  readonly retornoTotal: number | null
}

/**
 * Guarda las observaciones de un mes.
 *
 * Un fondo con las dos celdas vacias se borra en vez de escribirse en `null`:
 * es como se deshace una carga equivocada, y una fila de nulls no es lo mismo
 * que ninguna fila — la primera dice «este mes no tuvo retorno» y la segunda,
 * «este mes no se cargo». Solo la segunda es cierta.
 */
export async function guardarMes(mes: string, filas: readonly ObservacionEntrada[]): Promise<Resultado> {
  if (partirMes(mes) === null) return { ok: false, error: 'El mes no es válido.' }

  const supabase = await clienteServidor()

  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (user === null) return { ok: false, error: 'No hay sesión.' }

  const { data: asesor } = await supabase
    .from('advisors')
    .select('id')
    .eq('user_id', user.id)
    .maybeSingle()

  const conDato = filas.filter((f) => f.nav !== null || f.retornoTotal !== null)
  const vacias = filas.filter((f) => f.nav === null && f.retornoTotal === null)

  if (conDato.length > 0) {
    const { error } = await supabase.from('fondos_observaciones').upsert(
      conDato.map((f) => ({
        fondo_id: f.fondoId,
        mes,
        nav: f.nav,
        retorno_total: f.retornoTotal,
        creado_por: asesor?.id ?? null,
      })),
      { onConflict: 'fondo_id,mes' },
    )
    if (error !== null) return { ok: false, error: error.message }
  }

  if (vacias.length > 0) {
    const { error } = await supabase
      .from('fondos_observaciones')
      .delete()
      .eq('mes', mes)
      .in(
        'fondo_id',
        vacias.map((f) => f.fondoId),
      )
    if (error !== null) return { ok: false, error: error.message }
  }

  revalidatePath('/retornos/fondos')
  revalidatePath('/retornos/insights')
  revalidatePath('/retornos/carga')

  return { ok: true, guardadas: conDato.length }
}

/** Guarda el cierre del Treasury 10Y de un mes. */
export async function guardarTreasury(mes: string, cierre: number | null): Promise<Resultado> {
  if (partirMes(mes) === null) return { ok: false, error: 'El mes no es válido.' }

  const supabase = await clienteServidor()

  if (cierre === null) {
    const { error } = await supabase.from('treasury_10y').delete().eq('mes', mes)
    if (error !== null) return { ok: false, error: error.message }
  } else {
    const { error } = await supabase
      .from('treasury_10y')
      .upsert({ mes, cierre }, { onConflict: 'mes' })
    if (error !== null) return { ok: false, error: error.message }
  }

  revalidatePath('/retornos/carga')
  return { ok: true, guardadas: cierre === null ? 0 : 1 }
}

export interface FondoEntrada {
  readonly nombre: string
  readonly assetClass: string
  readonly inception: string | null
  readonly guidanceCortoPlazo: number | null
  readonly domicilio: string | null
}

/** Alta de un fondo. Lo unico obligatorio es lo que no se puede deducir. */
export async function altaFondo(entrada: FondoEntrada): Promise<Resultado> {
  const nombre = entrada.nombre.trim()
  if (nombre === '') return { ok: false, error: 'El fondo necesita un nombre.' }
  if (entrada.inception !== null && partirMes(entrada.inception) === null) {
    return { ok: false, error: 'La inception tiene que ser un mes AAAA-MM.' }
  }

  const supabase = await clienteServidor()
  const { error } = await supabase.from('fondos').insert({
    nombre,
    asset_class: entrada.assetClass,
    inception: entrada.inception,
    guidance_cp: entrada.guidanceCortoPlazo,
    domicilio: entrada.domicilio,
  })

  if (error !== null) {
    // El unique sobre el nombre es lo que impide dos series del mismo fondo,
    // que es como el libro termino con tres columnas de S&P 500.
    return {
      ok: false,
      error: error.code === '23505' ? `Ya existe un fondo llamado «${nombre}».` : error.message,
    }
  }

  revalidatePath('/retornos/carga')
  revalidatePath('/retornos/fondos')
  return { ok: true, guardadas: 1 }
}
