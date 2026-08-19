/**
 * Lectura de la configuración de Supabase.
 *
 * Falla al arrancar y con nombre propio si falta una variable, en vez de
 * dejar que el error aparezca tres pantallas después como un 401 sin
 * explicación. Los valores nunca se registran ni se devuelven al navegador
 * más allá de lo que ya es público: la URL y la clave anónima viajan al
 * cliente por diseño, la de servicio jamás.
 */

function requerida(nombre: string): string {
  const valor = process.env[nombre]
  if (valor === undefined || valor.trim() === '') {
    throw new Error(
      `Falta la variable de entorno ${nombre}. Copiá .env.local a apps/web/ o pedile las claves al admin de Supabase.`,
    )
  }
  return valor
}

export const urlSupabase = (): string => requerida('NEXT_PUBLIC_SUPABASE_URL')

export const claveAnonima = (): string => requerida('NEXT_PUBLIC_SUPABASE_ANON_KEY')
