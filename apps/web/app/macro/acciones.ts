'use server'

import { revalidatePath } from 'next/cache'

import { guardarMacro } from '../../lib/datos/macro'
import type { ResultadoGuardarMacro } from '../../lib/datos/macro'

/**
 * Guarda la macro y activa la versión nueva.
 *
 * La validación de negocio no vive acá: vive en `macroSchema`, que es el mismo
 * esquema que corre al leerla. Una validación que solo existe en el formulario
 * es una validación que se saltea cualquier otro camino de escritura, y esta
 * tabla la puede tocar un admin desde el panel de Supabase.
 *
 * Se revalidan las tres pantallas que calculan con ella. Sin esto el asesor
 * guardaría la macro nueva y seguiría viendo la matriz vieja, que es la peor
 * confusión posible: creer que un cambio no surtió efecto y volver a hacerlo.
 */
export async function guardarMacroAction(
  macro: unknown,
  nota: string,
): Promise<ResultadoGuardarMacro> {
  const resultado = await guardarMacro(macro, nota.trim())

  if (resultado.ok) {
    revalidatePath('/macro')
    revalidatePath('/benchmark')
    revalidatePath('/propuestas', 'layout')
  }

  return resultado
}
