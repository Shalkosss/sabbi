import { createServerClient } from '@supabase/ssr'
import { NextResponse } from 'next/server'
import type { NextRequest } from 'next/server'

import { claveAnonima, urlSupabase } from './lib/supabase/entorno'

/**
 * Proxy — lo que en Next 15 era el middleware.
 *
 * Hace dos cosas y ninguna más: refresca el token de la sesión antes de que la
 * petición llegue a la página, y manda a la pantalla de ingreso a quien no
 * tenga sesión. La autorización de verdad no vive acá sino en las políticas
 * RLS de la base; esto es solo el desvío, para no mostrar una pantalla vacía
 * a quien no inició sesión.
 */

const PUBLICAS = ['/ingresar']

export async function proxy(peticion: NextRequest) {
  let respuesta = NextResponse.next({ request: peticion })

  const supabase = createServerClient(urlSupabase(), claveAnonima(), {
    cookies: {
      getAll: () => peticion.cookies.getAll(),
      setAll: (nuevas) => {
        for (const { name, value } of nuevas) peticion.cookies.set(name, value)
        respuesta = NextResponse.next({ request: peticion })
        for (const { name, value, options } of nuevas) respuesta.cookies.set(name, value, options)
      },
    },
  })

  // getUser valida el token contra Supabase. getSession solo lee la cookie, que
  // en el servidor no alcanza: la cookie la puede escribir cualquiera.
  const {
    data: { user },
  } = await supabase.auth.getUser()

  const ruta = peticion.nextUrl.pathname
  const esPublica = PUBLICAS.some((publica) => ruta.startsWith(publica))

  if (user === null && !esPublica) {
    const destino = peticion.nextUrl.clone()
    destino.pathname = '/ingresar'
    destino.searchParams.set('volver', ruta)
    return NextResponse.redirect(destino)
  }

  if (user !== null && esPublica) {
    const destino = peticion.nextUrl.clone()
    destino.pathname = '/'
    destino.search = ''
    return NextResponse.redirect(destino)
  }

  return respuesta
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)'],
}
