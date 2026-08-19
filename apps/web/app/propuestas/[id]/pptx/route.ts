import { readFile } from 'node:fs/promises'
import path from 'node:path'

import { armarDeck } from '@sabbi/export'

import { construirPropuesta } from '../../../../lib/armar-propuesta'
import {
  cargarPropuesta,
  catalogoDeAssetClass,
  catalogoDeProductos,
} from '../../../../lib/datos/propuestas'
import { asesorActual } from '../../../../lib/supabase/servidor'

/**
 * El deck de la propuesta, como descarga.
 *
 * Se arma en cada pedido a partir de la revision guardada, igual que la vista
 * web: el deck no es una copia congelada que pueda quedar vieja, es la misma
 * propuesta en otro formato. Si el motor no puede correr, no hay deck — y se
 * dice con un 409, no con un archivo a medias.
 */

/** La plantilla vive en el paquete, fuera de la app. `cwd` es `apps/web`. */
const PLANTILLA = path.join(
  process.cwd(),
  '..',
  '..',
  'packages',
  'export',
  'pptx',
  'replica',
  'template.pptx',
)

/** Sin esto un nombre con acentos o comas rompe la cabecera. */
const nombreDeArchivo = (cliente: string): string =>
  `Propuesta - ${cliente}.pptx`.replace(/[\\/:*?"<>|]/g, '-')

export async function GET(
  _peticion: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const asesor = await asesorActual()
  if (asesor === null) {
    return new Response('No identificado como asesor.', { status: 401 })
  }

  const { id } = await params
  const cargada = await cargarPropuesta(id)
  if (cargada === null) return new Response('La propuesta no existe.', { status: 404 })

  const [catalogo, assetClassCatalogo] = await Promise.all([
    catalogoDeProductos(),
    catalogoDeAssetClass(),
  ])

  const resultado = construirPropuesta(cargada.revision, {
    mandato: cargada.mandato,
    catalogo,
    assetClassCatalogo,
  })

  if (!resultado.ok) {
    const detalle = resultado.bloqueos.map((b) => b.mensaje).join(' ')
    return new Response(`La propuesta todavia no se puede calcular. ${detalle}`, { status: 409 })
  }

  try {
    const plantilla = await readFile(PLANTILLA)
    const { archivo } = armarDeck(plantilla, resultado.propuesta, { emitido: new Date() })

    return new Response(archivo as BodyInit, {
      headers: {
        'Content-Type':
          'application/vnd.openxmlformats-officedocument.presentationml.presentation',
        'Content-Disposition': `attachment; filename*=UTF-8''${encodeURIComponent(
          nombreDeArchivo(resultado.propuesta.cliente.nombre),
        )}`,
        'Cache-Control': 'no-store',
      },
    })
  } catch (error) {
    console.error('No se pudo armar el deck:', error)
    return new Response('No se pudo armar el deck. Avisale al equipo tecnico.', { status: 500 })
  }
}
