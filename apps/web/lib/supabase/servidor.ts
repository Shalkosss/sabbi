import { createServerClient } from '@supabase/ssr'
import { cookies } from 'next/headers'

import { claveAnonima, urlSupabase } from './entorno'

/**
 * Cliente de Supabase para el servidor.
 *
 * Usa la clave anónima y la sesión del asesor, nunca la de servicio: así toda
 * consulta pasa por las políticas RLS que ya están validadas contra la base.
 * Un bug de la app puede devolver menos datos de los esperados; nunca los de
 * otro asesor.
 */
export async function clienteServidor() {
  const galleta = await cookies()

  return createServerClient(urlSupabase(), claveAnonima(), {
    cookies: {
      getAll: () => galleta.getAll(),
      setAll: (nuevas) => {
        try {
          for (const { name, value, options } of nuevas) galleta.set(name, value, options)
        } catch {
          // Un Server Component no puede escribir cookies. No es un problema:
          // el proxy refresca la sesión antes de que la petición llegue acá.
        }
      },
    },
  })
}

export interface Asesor {
  readonly id: string
  readonly nombre: string
  readonly email: string
  readonly rol: 'asesor' | 'admin'
}

/**
 * El asesor de la sesión actual.
 *
 * `null` cuando no hay sesión, y también cuando hay un usuario de Auth que no
 * tiene fila en `advisors`: sin ella las políticas no lo dejan escribir nada,
 * así que tratarlo como no identificado evita errores mudos más adelante.
 */
export async function asesorActual(): Promise<Asesor | null> {
  const supabase = await clienteServidor()

  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (user === null) return null

  const { data } = await supabase
    .from('advisors')
    .select('id, nombre, email, rol')
    .eq('user_id', user.id)
    .maybeSingle()

  return (data) ?? null
}
