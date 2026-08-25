import { armarXlsxPropuesta } from '@sabbi/export'

import { comoDescargaXlsx, nombreDeArchivo, prepararDescarga } from '../../../../lib/descarga'

/**
 * La descarga del Excel de la propuesta.
 *
 * Es el documento de trabajo de la mesa: las siete secciones apiladas en una
 * hoja, del inventario de hoy al blotter. Se arma en el momento y del mismo
 * objeto `Propuesta` que pinta la pantalla y los dos decks — por la misma
 * razón que ellos: un archivo guardado en disco es una copia que envejece
 * sola, y la primera vez que alguien corrige la ficha ya está mintiendo.
 *
 * En el momento no quiere decir recalculado siempre: de una propuesta
 * publicada sale el snapshot con el que se publicó. El archivo se escribe
 * ahora, las cifras son las de entonces.
 *
 * Pasa por la sesión del asesor y por RLS, igual que la página: quien no
 * puede ver la propuesta tampoco puede bajar su Excel.
 */

/** Se arma con datos frescos de la base; no hay nada que cachear. */
export const dynamic = 'force-dynamic'

export async function GET(
  _peticion: Request,
  { params }: { params: Promise<{ id: string }> },
): Promise<Response> {
  const { id } = await params
  const preparada = await prepararDescarga(id)
  if (!preparada.ok) return preparada.respuesta

  // La macro con la que se calculó esta propuesta, escrita en el pie: un Excel
  // que circula por correo tiene que poder explicar de dónde salen sus cifras.
  // Publicada, es la que quedó congelada, no la que esté activa hoy — si no,
  // el pie diría una macro que nunca tocó estas cifras.
  const fecha = new Date()
  const bytes = armarXlsxPropuesta(preparada.propuesta, {
    fecha,
    asesor: preparada.asesor,
    versionMacro: preparada.versionMacro,
  })

  return comoDescargaXlsx(
    bytes,
    nombreDeArchivo(preparada.propuesta.cliente.nombre, '', fecha, 'xlsx'),
  )
}
