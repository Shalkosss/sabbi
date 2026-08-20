import { armarDeckRediseno } from '@sabbi/export'

import { construirPropuesta } from '../../../../lib/armar-propuesta'
import {
  cargarPropuesta,
  catalogoDeAssetClass,
  catalogoDeProductos,
} from '../../../../lib/datos/propuestas'
import { asesorActual } from '../../../../lib/supabase/servidor'

/**
 * La descarga del deck.
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

const TIPO_PPTX = 'application/vnd.openxmlformats-officedocument.presentationml.presentation'

/**
 * Un nombre de archivo que sobreviva a cualquier sistema.
 *
 * Los nombres de clientes traen tildes, comas y a veces una barra. La barra en
 * particular no es cosmética: parte la ruta al guardar.
 */
function nombreDeArchivo(cliente: string, fecha: Date): string {
  const limpio = cliente
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^\w\s-]/g, '')
    .trim()
    .replace(/\s+/g, '-')
  const dia = fecha.toISOString().slice(0, 10)
  return `Sabbi-${limpio === '' ? 'propuesta' : limpio}-${dia}.pptx`
}

export async function GET(
  _peticion: Request,
  { params }: { params: Promise<{ id: string }> },
): Promise<Response> {
  const asesor = await asesorActual()
  if (asesor === null) return new Response('Sin sesión de asesor.', { status: 401 })

  const { id } = await params
  const cargada = await cargarPropuesta(id)
  if (cargada === null) return new Response('No existe esa propuesta.', { status: 404 })

  const [catalogo, assetClassCatalogo] = await Promise.all([
    catalogoDeProductos(),
    catalogoDeAssetClass(),
  ])

  const resultado = construirPropuesta(cargada.revision, {
    mandato: cargada.mandato,
    catalogo,
    assetClassCatalogo,
  })

  // El mismo corte que la pantalla: sin propuesta calculada no hay deck que
  // bajar, y un archivo con las láminas vacías sería peor que el error.
  if (!resultado.ok) {
    return new Response(
      `La propuesta no se puede calcular todavía: ${resultado.bloqueos.map((b) => b.mensaje).join(' · ')}`,
      { status: 409, headers: { 'content-type': 'text/plain; charset=utf-8' } },
    )
  }

  const fecha = new Date()
  const bytes = await armarDeckRediseno(resultado.propuesta, { fecha, asesor: asesor.nombre })
  const archivo = nombreDeArchivo(resultado.propuesta.cliente.nombre, fecha)

  return new Response(new Uint8Array(bytes), {
    headers: {
      'content-type': TIPO_PPTX,
      'content-length': String(bytes.byteLength),
      'content-disposition': `attachment; filename="${archivo}"; filename*=UTF-8''${encodeURIComponent(archivo)}`,
    },
  })
}
