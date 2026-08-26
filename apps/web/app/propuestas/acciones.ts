'use server'

import { revalidatePath } from 'next/cache'

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
 * Abre la versión siguiente y devuelve a cuál hay que ir.
 *
 * Ir ahí no es opcional: quedarse mirando la versión publicada después de crear
 * la nueva es exactamente la confusión que este flujo tiene que evitar — dos
 * propuestas del mismo cliente abiertas y ninguna señal de en cuál se está
 * escribiendo. Pero la navegación la hace el componente y no un `redirect` acá,
 * y la diferencia importa: un `redirect` en una acción de servidor corta la
 * vuelta al navegador, así que lo que hubiera después de la llamada no llega a
 * correr. Y sí hay algo después — avisarle a quien tenga la ficha abierta de
 * que el id al que van sus guardados acaba de cambiar.
 */
export async function nuevaVersionAction(
  propuestaId: string,
): Promise<{ readonly error: string; readonly propuestaId: string }> {
  const resultado = await crearVersionNueva(propuestaId)

  if (!resultado.ok) return { error: resultado.error, propuestaId: '' }

  revalidatePath('/propuestas')
  return { error: '', propuestaId: resultado.propuestaId }
}
