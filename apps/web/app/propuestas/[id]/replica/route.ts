import { armarDeckReplica, leerPlantillaReplica } from '@sabbi/export'

import {
  comoDescarga,
  nombreDeArchivo,
  prepararDescarga,
} from '../../../../lib/descarga'

/**
 * La descarga del deck réplica.
 *
 * Sale corto a propósito: de las 22 láminas de la plantilla solo se imprimen
 * las que hoy tienen de dónde sacar su dato. El mapa de `@sabbi/export` dice
 * lámina por lámina qué le falta a cada una, y `npm run revisar-deck` lo lista.
 * Una lámina a medias, con un `{{token}}` impreso delante de un cliente, sería
 * peor que no tenerla.
 *
 * La cabecera `X-Sabbi-Laminas` lleva las que salieron, para que el que la
 * descarga no tenga que contarlas.
 */

export const dynamic = 'force-dynamic'

export async function GET(
  _peticion: Request,
  { params }: { params: Promise<{ id: string }> },
): Promise<Response> {
  const { id } = await params
  const preparada = await prepararDescarga(id)
  if (!preparada.ok) return preparada.respuesta

  const fecha = new Date()
  const { bytes, laminas } = armarDeckReplica(leerPlantillaReplica(), preparada.propuesta, {
    fecha,
  })

  const respuesta = comoDescarga(
    bytes,
    nombreDeArchivo(preparada.propuesta.cliente.nombre, '-replica', fecha),
  )
  respuesta.headers.set('X-Sabbi-Laminas', laminas.join(','))
  return respuesta
}
