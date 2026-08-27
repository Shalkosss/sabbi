'use server'

import { revalidatePath } from 'next/cache'

import type { ClaveHito } from '../../lib/agenda'
import { marcarHito } from '../../lib/datos/agenda'

/**
 * Marca un hito de la ruta como cumplido, o lo devuelve a pendiente.
 *
 * Se revalida la agenda y no la ficha: el hito no cambia ninguna cifra de la
 * propuesta, solo dónde está parado ese cliente en su plazo.
 */
export async function marcarHitoAction(
  fichaId: string,
  hito: ClaveHito,
  hecho: boolean,
): Promise<{ readonly error?: string }> {
  const resultado = await marcarHito(fichaId, hito, hecho)
  if (resultado.error === undefined) revalidatePath('/agenda')
  return resultado
}
