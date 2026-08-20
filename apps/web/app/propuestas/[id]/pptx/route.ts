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

const RUTA_EN_PAQUETE = path.join('packages', 'export', 'pptx', 'replica', 'template.pptx')

/**
 * La plantilla vive en el paquete, fuera de la app, y se lee del disco.
 *
 * Donde queda ese disco depende de como se empaqueto la funcion: en local
 * `cwd` es `apps/web`, y en una funcion serverless puede ser la raiz del
 * monorepo segun como se haya trazado la dependencia. En vez de apostar a una
 * ruta se prueban las dos y se recuerda la que sirvio, porque equivocarse aca
 * significa que el boton anda en la maquina del que programa y falla en
 * produccion.
 */
const CANDIDATAS = [
  path.join(process.cwd(), '..', '..', RUTA_EN_PAQUETE),
  path.join(process.cwd(), RUTA_EN_PAQUETE),
  path.join(process.cwd(), '..', RUTA_EN_PAQUETE),
]

let plantillaEnCache: Buffer | null = null

async function leerPlantilla(): Promise<Buffer> {
  if (plantillaEnCache !== null) return plantillaEnCache

  for (const candidata of CANDIDATAS) {
    try {
      plantillaEnCache = await readFile(candidata)
      return plantillaEnCache
    } catch {
      // Sigue con la proxima. Si ninguna existe, el error de abajo lo explica.
    }
  }

  throw new Error(
    `No se encontro la plantilla del deck. Se busco en: ${CANDIDATAS.join(', ')}. ` +
      'Revisar `outputFileTracingIncludes` en next.config.ts.',
  )
}

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
    const plantilla = await leerPlantilla()
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
