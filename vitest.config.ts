import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    include: ['packages/**/*.test.ts', 'apps/**/*.test.ts'],
    environment: 'node',
    coverage: {
      provider: 'v8',
      include: ['packages/core/src/**/*.ts', 'packages/config/src/**/*.ts'],
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
