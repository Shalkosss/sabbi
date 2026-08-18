import { fileURLToPath } from 'node:url'

import { defineConfig } from 'vitest/config'

/**
 * Los paquetes se publican compilados — la app de Next consume `dist` — pero
 * los tests apuntan siempre al codigo fuente: nadie tiene que acordarse de
 * compilar antes de correr la suite.
 */
const fuente = (paquete: string) =>
  fileURLToPath(new URL(`./packages/${paquete}/src/index.ts`, import.meta.url))

export default defineConfig({
  resolve: {
    alias: {
      '@sabbi/core': fuente('core'),
      '@sabbi/config': fuente('config'),
      '@sabbi/io': fuente('io'),
    },
  },
  test: {
    include: ['packages/**/*.test.ts', 'apps/**/*.test.ts'],
    environment: 'node',
    coverage: {
      provider: 'v8',
      include: [
        'packages/core/src/**/*.ts',
        'packages/config/src/**/*.ts',
        'packages/io/src/**/*.ts',
      ],
      exclude: ['**/__tests__/**'],
      thresholds: {
        lines: 90,
        statements: 88,
        functions: 90,
        // Mas bajo a proposito. El motor es un port literal de la macro VBA e
        // incluye sus guardas defensivas: topes de iteracion y la rama que
        // escala la cadena de pisos cuando no queda ningun instrumento libre.
        // Se analizaron una por una y no son alcanzables con entradas validas.
        // Se conservan para que el port siga siendo comparable con el original,
        // pero no se fuerzan tests artificiales para cubrirlas.
        branches: 65,
      },
    },
  },
})
