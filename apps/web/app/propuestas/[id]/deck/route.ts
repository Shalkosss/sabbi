import { armarDeckRediseno } from '@sabbi/export'

import {
  comoDescarga,
  nombreDeArchivo,
  prepararDescarga,
} from '../../../../lib/descarga'

/**
 * La descarga del deck rediseñado.
 *
 * Se arma en el momento, del mismo objeto `Propuesta` que pinta la pantalla:
 * un deck guardado en disco es una copia que envejece sola, y la primera vez
 * que alguien corrige la ficha ya está mintiendo. Generarlo cada vez cuesta
 * unos cientos de milisegundos y no hay forma de que muestre una cifra que el
 * cálculo ya no produciría.
 *
 * Pasa por la sesión del asesor y por RLS, igual que la página: quien no puede
 * ver la propuesta tampoco puede descargar su deck.
 */

/** El deck se arma con datos frescos de la base; no hay nada que cachear. */
export const dynamic = 'force-dynamic'

export async function GET(
  _peticion: Request,
  { params }: { params: Promise<{ id: string }> },
): Promise<Response> {
  const { id } = await params
  const preparada = await prepararDescarga(id)
  if (!preparada.ok) return preparada.respuesta

  const fecha = new Date()
  const bytes = await armarDeckRediseno(preparada.propuesta, { fecha, asesor: preparada.asesor })

  return comoDescarga(bytes, nombreDeArchivo(preparada.propuesta.cliente.nombre, '', fecha))
}
