import { join } from 'node:path'

import type { NextConfig } from 'next'

/**
 * Los paquetes del monorepo se consumen compilados, desde su `dist`.
 *
 * Servirlos como TypeScript no funciona: sus imports internos llevan la
 * extension `.js` que exige Node para ESM, y Turbopack no la traduce al `.ts`
 * de al lado. `npm run dev` corre `tsc --build` antes de levantar la app.
 */
const config: NextConfig = {
  /**
   * El rastreo de archivos arranca en la raiz del monorepo, no en `apps/web`.
   *
   * Sin esto, todo lo que vive fuera de la app queda fuera del bundle de
   * produccion — incluida la plantilla del deck replica, que es un .pptx de
   * `packages/export` y no un modulo que el rastreador pueda seguir por si
   * solo.
   */
  outputFileTracingRoot: join(import.meta.dirname, '..', '..'),
  outputFileTracingIncludes: {
    '/propuestas/*/replica': ['../../packages/export/pptx/replica/template.pptx'],
  },
}

export default config
