import 'server-only'

import type { Propuesta } from '@sabbi/core'

import { construirPropuesta } from './armar-propuesta'
import {
  anotacionesDeLinea,
  cargarPropuesta,
  catalogoDeAssetClass,
  catalogoDeProductos,
} from './datos/propuestas'
import { macroParaCalcular } from './datos/macro'
import { asesorActual } from './supabase/servidor'

/**
 * Lo que las dos descargas necesitan antes de armar nada.
 *
 * Las dos —el deck rediseñado y el réplica— hacen exactamente lo mismo hasta
 * el momento de escribir el archivo: comprobar la sesión, leer la propuesta y
 * correr el motor. Duplicarlo era garantizar que un día una de las dos deje de
 * comprobar algo que la otra sí comprueba.
 */

export type Preparada =
  | { readonly ok: true; readonly propuesta: Propuesta; readonly asesor: string }
  | { readonly ok: false; readonly respuesta: Response }

const texto = (cuerpo: string, status: number): Response =>
  new Response(cuerpo, { status, headers: { 'content-type': 'text/plain; charset=utf-8' } })

export async function prepararDescarga(propuestaId: string): Promise<Preparada> {
  const asesor = await asesorActual()
  if (asesor === null) return { ok: false, respuesta: texto('Sin sesión de asesor.', 401) }

  const cargada = await cargarPropuesta(propuestaId)
  if (cargada === null) return { ok: false, respuesta: texto('No existe esa propuesta.', 404) }

  const [catalogo, assetClassCatalogo, anotaciones, macro] = await Promise.all([
    catalogoDeProductos(),
    catalogoDeAssetClass(),
    anotacionesDeLinea(propuestaId),
    // El deck no puede calcular con una macro distinta de la que muestra la
    // pantalla: es la misma propuesta vista de otra manera.
    macroParaCalcular(),
  ])

  const resultado = construirPropuesta(cargada.revision, {
    mandato: cargada.mandato,
    catalogo,
    assetClassCatalogo,
    anotaciones,
    macro,
  })

  // El mismo corte que la pantalla: sin propuesta calculada no hay archivo que
  // bajar, y uno con las láminas vacías sería peor que el error.
  if (!resultado.ok) {
    return {
      ok: false,
      respuesta: texto(
        `La propuesta no se puede calcular todavía: ${resultado.bloqueos.map((b) => b.mensaje).join(' · ')}`,
        409,
      ),
    }
  }

  return { ok: true, propuesta: resultado.propuesta, asesor: asesor.nombre }
}

/**
 * Un nombre de archivo que sobreviva a cualquier sistema.
 *
 * Los nombres de clientes traen tildes, comas y a veces una barra. La barra en
 * particular no es cosmética: parte la ruta al guardar.
 */
export function nombreDeArchivo(
  cliente: string,
  sufijo: string,
  fecha: Date,
  extension: 'pptx' | 'xlsx' = 'pptx',
): string {
  const limpio = cliente
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^\w\s-]/g, '')
    .trim()
    .replace(/\s+/g, '-')
  const dia = fecha.toISOString().slice(0, 10)
  return `Sabbi-${limpio === '' ? 'propuesta' : limpio}${sufijo}-${dia}.${extension}`
}

export const TIPO_PPTX =
  'application/vnd.openxmlformats-officedocument.presentationml.presentation'

export const TIPO_XLSX = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'

/** La respuesta de descarga, con el nombre que el navegador va a usar. */
const descarga = (bytes: Uint8Array, archivo: string, tipo: string): Response =>
  new Response(new Uint8Array(bytes), {
    headers: {
      'content-type': tipo,
      'content-length': String(bytes.byteLength),
      'content-disposition': `attachment; filename="${archivo}"; filename*=UTF-8''${encodeURIComponent(archivo)}`,
    },
  })

export const comoDescarga = (bytes: Uint8Array, archivo: string): Response =>
  descarga(bytes, archivo, TIPO_PPTX)

export const comoDescargaXlsx = (bytes: Uint8Array, archivo: string): Response =>
  descarga(bytes, archivo, TIPO_XLSX)
