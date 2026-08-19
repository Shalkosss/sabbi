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
   * La plantilla del deck no se importa: se lee del disco en tiempo de
   * ejecucion. Sin declararla, el trazado de dependencias no la ve y la
   * funcion serverless se despliega sin el archivo — anda en local y falla
   * en produccion, que es la peor forma de fallar.
   */
  outputFileTracingIncludes: {
    '/propuestas/[id]/pptx': ['../../packages/export/pptx/replica/template.pptx'],
  },
}

export default config
