'use client'

import { createBrowserClient } from '@supabase/ssr'
import type { SupabaseClient } from '@supabase/supabase-js'

/**
 * Cliente de Supabase para el navegador.
 *
 * Existe por una sola razon: Realtime. Todo lo demas —leer la ficha, guardar
 * una correccion, calcular el plan— sigue pasando por el servidor con la
 * sesion del asesor, y eso no cambia: los pesos del modelo no viajan al
 * navegador y las escrituras siguen atravesando las mismas politicas.
 *
 * Lo que Realtime necesita es una conexion que el servidor no puede sostener:
 * un websocket abierto mientras la pestaña este abierta. Usa la clave anonima
 * —que ya es publica por diseño— y la sesion que vive en la cookie, asi que un
 * asesor solo recibe los cambios de las filas que ya podria leer.
 *
 * Uno solo por pestaña. Dos clientes son dos websockets, dos suscripciones a
 * los mismos cambios y dos veces cada evento aplicado a la pantalla.
 */
let cliente: SupabaseClient | null = null

export function clienteNavegador(): SupabaseClient {
  cliente ??= createBrowserClient(
    process.env['NEXT_PUBLIC_SUPABASE_URL'] ?? '',
    process.env['NEXT_PUBLIC_SUPABASE_ANON_KEY'] ?? '',
  )
  return cliente
}
