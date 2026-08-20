import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'

/**
 * La plantilla del deck replica, leida de su propio paquete.
 *
 * Vive aparte del renderizador para que ese siga sin tocar el disco: recibe
 * bytes y devuelve bytes, y asi se puede probar sin sistema de archivos y usar
 * desde donde sea. Este modulo es el unico que sabe donde esta el archivo.
 *
 * La ruta se resuelve contra `import.meta.url`, no contra el directorio de
 * trabajo: la aplicacion corre desde `apps/web` y el proceso de produccion
 * desde donde lo deje la plataforma.
 */

/** La plantilla, en el paquete. Desde `dist/pptx/replica/` son tres niveles. */
const RUTA = new URL('../../../pptx/replica/template.pptx', import.meta.url)

export const rutaDePlantilla = (): string => fileURLToPath(RUTA)

let cache: Uint8Array | null = null

/**
 * Lee la plantilla una sola vez.
 *
 * Son 578 KB y no cambia entre peticiones: leerla en cada descarga es medio
 * megabyte de disco por click sin ninguna razon.
 */
export function leerPlantillaReplica(): Uint8Array {
  cache ??= new Uint8Array(readFileSync(RUTA))
  return cache
}
