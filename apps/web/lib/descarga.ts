import 'server-only'

import type { Propuesta } from '@sabbi/core'

import { propuestaVigente } from './propuesta-vigente'
import { asesorActual } from './supabase/servidor'

/**
 * Lo que las tres descargas necesitan antes de armar nada.
 *
 * Las tres —el Excel, el deck rediseñado y el réplica— hacen exactamente lo
 * mismo hasta el momento de escribir el archivo: comprobar la sesión y
 * resolver de dónde salen las cifras. Duplicarlo era garantizar que un día una
 * de las tres deje de comprobar algo que las otras sí comprueban.
 *
 * De dónde salen las cifras lo decide `propuestaVigente` y no esta función:
 * un borrador se recalcula, una publicada se lee de su snapshot. Un archivo
 * que circula por correo tiene que decir exactamente lo mismo que la pantalla
 * de la que se bajó, y con qué macro se calculó.
 */

export type Preparada =
  | {
      readonly ok: true
      readonly propuesta: Propuesta
      readonly asesor: string
      /** La macro con la que se calculó, para el pie del archivo. */
      readonly versionMacro: number | null
      readonly publicada: boolean
    }
  | { readonly ok: false; readonly respuesta: Response }

const texto = (cuerpo: string, status: number): Response =>
  new Response(cuerpo, { status, headers: { 'content-type': 'text/plain; charset=utf-8' } })

export async function prepararDescarga(propuestaId: string): Promise<Preparada> {
  const asesor = await asesorActual()
  if (asesor === null) return { ok: false, respuesta: texto('Sin sesión de asesor.', 401) }

  const vigente = await propuestaVigente(propuestaId)
  if (vigente === null) return { ok: false, respuesta: texto('No existe esa propuesta.', 404) }

  // El mismo corte que la pantalla: sin propuesta calculada no hay archivo que
  // bajar, y uno con las láminas vacías sería peor que el error.
  if (!vigente.ok) {
    return {
      ok: false,
      respuesta: texto(
        `La propuesta no se puede calcular todavía: ${vigente.bloqueos.map((b) => b.mensaje).join(' · ')}`,
        409,
      ),
    }
  }

  return {
    ok: true,
    propuesta: vigente.propuesta,
    asesor: asesor.nombre,
    versionMacro: vigente.versionMacro,
    publicada: vigente.congelada !== null,
  }
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
