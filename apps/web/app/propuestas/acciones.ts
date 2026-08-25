'use server'

import { revalidatePath } from 'next/cache'
import { redirect } from 'next/navigation'

import { crearVersionNueva, publicarPropuesta } from '../../lib/datos/biblioteca'
import type { ResultadoPublicar } from '../../lib/datos/biblioteca'

/**
 * Publicar y versionar.
 *
 * Son las dos únicas acciones de esta aplicación que dejan una cifra escrita.
 * Todo lo demás se deriva en cada lectura a propósito; publicar es el momento
 * en que una propuesta deja de ser un cálculo y pasa a ser un documento.
 *
 * La validación no vive acá: vive en `reparosParaPublicar`, que corre sobre el
 * objeto `Propuesta` y es el mismo control que la pantalla muestra antes de
 * ofrecer el botón. Una validación que solo existiera en el formulario sería
 * una validación que se saltea cualquier otro camino.
 */

export async function publicarAction(propuestaId: string): Promise<ResultadoPublicar> {
  const resultado = await publicarPropuesta(propuestaId)

  if (resultado.ok) {
    revalidatePath(`/propuestas/${propuestaId}`)
    revalidatePath('/propuestas')
  }

  return resultado
}

/**
 * Abre la versión siguiente y lleva al asesor a ella.
 *
 * El redirect es parte de la acción y no una decisión del componente: quedarse
 * mirando la versión publicada después de crear la nueva es exactamente la
 * confusión que este flujo tiene que evitar — dos propuestas del mismo cliente
 * abiertas y ninguna señal de en cuál se está escribiendo.
 */
export async function nuevaVersionAction(
  propuestaId: string,
): Promise<{ readonly error: string }> {
  const resultado = await crearVersionNueva(propuestaId)

  if (!resultado.ok) return { error: resultado.error }

  revalidatePath('/propuestas')
  redirect(`/propuestas/${resultado.propuestaId}`)
}
