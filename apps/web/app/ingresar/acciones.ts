'use server'

import { redirect } from 'next/navigation'

import { clienteServidor } from '../../lib/supabase/servidor'

/**
 * Ingreso y salida.
 *
 * Las cuentas las crea Sabbi en Supabase y se enlazan a una fila de
 * `advisors`: acá no hay registro abierto. Un usuario de Auth sin esa fila
 * puede iniciar sesión pero no escribir nada, así que la pantalla lo dice en
 * vez de dejarlo chocar contra un error de permisos.
 */

export type ResultadoIngreso = { readonly error: string } | null

/**
 * Rechaza un `volver` que apunte fuera de la app.
 *
 * No alcanza con exigir que empiece en `/` y no en `//`: el navegador
 * normaliza la barra invertida a barra, así que `/\evil.com` sale de acá como
 * ruta interna y llega al navegador como `//evil.com`, que es un host. El
 * valor viene del query string, o sea que lo elige quien manda el enlace.
 */
const destinoSeguro = (volver: FormDataEntryValue | null): string => {
  if (typeof volver !== 'string') return '/'
  const normalizado = volver.replace(/\\/g, '/')
  return normalizado.startsWith('/') && !normalizado.startsWith('//') ? normalizado : '/'
}

export async function ingresar(_previo: ResultadoIngreso, datos: FormData): Promise<ResultadoIngreso> {
  const email = datos.get('email')
  const clave = datos.get('clave')

  if (typeof email !== 'string' || typeof clave !== 'string' || email === '' || clave === '') {
    return { error: 'Escribí tu correo y tu contraseña.' }
  }

  const supabase = await clienteServidor()
  const { error } = await supabase.auth.signInWithPassword({ email, password: clave })

  if (error !== null) {
    // El mensaje de Supabase no distingue si el correo existe, y está bien:
    // decirlo le regalaría a un atacante la lista de asesores.
    return { error: 'No pude iniciar sesión con esos datos. Revisá el correo y la contraseña.' }
  }

  redirect(destinoSeguro(datos.get('volver')))
}

export async function salir(): Promise<void> {
  const supabase = await clienteServidor()
  await supabase.auth.signOut()
  redirect('/ingresar')
}
