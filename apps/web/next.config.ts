import type { NextConfig } from 'next'

/**
 * Los paquetes del monorepo se consumen compilados, desde su `dist`.
 *
 * Servirlos como TypeScript no funciona: sus imports internos llevan la
 * extension `.js` que exige Node para ESM, y Turbopack no la traduce al `.ts`
 * de al lado. `npm run dev` corre `tsc --build` antes de levantar la app.
 */
const config: NextConfig = {}

export default config
