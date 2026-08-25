// @ts-check

/**
 * El linter del repo.
 *
 * `package.json` traia el script `lint` desde el principio, pero ni ESLint ni
 * su configuracion estaban: `eslint .` fallaba en cualquier checkout limpio.
 * Un script que no corre es peor que no tenerlo — el CI no lo podia incluir
 * sin quedar en rojo permanente, y quien lo probaba una vez aprendia a no
 * volver a intentarlo.
 *
 * Lo que se busca aca no es estilo. El formato no lo discute nadie y no vale
 * un rojo; lo que vale es lo que el typecheck no ve y un test podria no
 * cubrir: una promesa sin esperar, un `catch` que se traga el error, una
 * variable que quedo de un refactor a medias. Por eso van las reglas de
 * correctitud de `typescript-eslint` con tipos, y no el paquete `stylistic`.
 *
 * Las reglas con tipos necesitan un `tsconfig`, y por eso el proyecto se
 * resuelve desde el archivo mas cercano. Los tests entran igual que el resto:
 * un `await` olvidado en un test lo vuelve un test que no prueba nada, que es
 * justo el bug que mas caro sale.
 */

import js from '@eslint/js'
import globals from 'globals'
import tseslint from 'typescript-eslint'

export default tseslint.config(
  {
    // Lo generado no se lee ni se arregla: se vuelve a generar.
    ignores: [
      '**/node_modules/**',
      '**/dist/**',
      '**/.next/**',
      '**/coverage/**',
      '**/*.tsbuildinfo',
      'apps/web/next-env.d.ts',
    ],
  },

  js.configs.recommended,
  ...tseslint.configs.recommendedTypeChecked,

  {
    languageOptions: {
      parserOptions: {
        // `projectService` resuelve el tsconfig mas cercano a cada archivo, que
        // en un monorepo de cinco paquetes es lo unico que no obliga a
        // enumerarlos. `allowDefaultProject` cubre los que no pertenecen a
        // ninguno —los config de la raiz—, que si no quedan sin parsear.
        projectService: {
          allowDefaultProject: ['vitest.config.ts', 'eslint.config.js'],
        },
        tsconfigRootDir: import.meta.dirname,
      },
    },

    rules: {
      // ── Lo que de verdad rompe cosas ────────────────────────────────────
      // Una promesa sin esperar en un server action deja el guardado a medio
      // camino y devuelve exito. Es el error que ni el typecheck ni la
      // pantalla muestran.
      '@typescript-eslint/no-floating-promises': 'error',
      '@typescript-eslint/no-misused-promises': 'error',
      '@typescript-eslint/await-thenable': 'error',

      // ── Lo que sobra ────────────────────────────────────────────────────
      // Restos de un refactor a medias. Se avisan, no se cortan: bloquear el
      // CI por una variable sin usar entrena a saltearse el CI.
      '@typescript-eslint/no-unused-vars': [
        'warn',
        { argsIgnorePattern: '^_', varsIgnorePattern: '^_', caughtErrors: 'all', caughtErrorsIgnorePattern: '^_' },
      ],

      // Un `async` sin `await` no es un error en las dos formas en que este
      // repo lo usa: un server action de Next tiene que ser async por
      // contrato aunque su cuerpo sea sincrono —`calcularPlan` corre el motor,
      // que es puro— y un doble de test que implementa una interfaz async
      // tiene que devolver una promesa aunque no espere nada. Cinco falsos
      // positivos y ningun hallazgo.
      '@typescript-eslint/require-await': 'off',

      // ── Lo que este repo hace a proposito ───────────────────────────────
      // El codigo habla con Supabase y con archivos de Excel, y en esa frontera
      // lo que entra es `any` de verdad. Lo que importa es que no llegue al
      // motor, y de eso se ocupan los esquemas de Zod y el typecheck; una regla
      // que lo prohiba aca solo produce supresiones.
      '@typescript-eslint/no-explicit-any': 'off',
      '@typescript-eslint/no-unsafe-assignment': 'off',
      '@typescript-eslint/no-unsafe-member-access': 'off',
      '@typescript-eslint/no-unsafe-argument': 'off',
      '@typescript-eslint/no-unsafe-call': 'off',
      '@typescript-eslint/no-unsafe-return': 'off',
      // El motor arma mensajes con numeros y con lo que venga del catalogo.
      '@typescript-eslint/restrict-template-expressions': 'off',
    },
  },

  {
    // Los scripts de `tools/` son .mjs de Node: sin tipos y con su propio mundo.
    // Corren con `node`, asi que `console` y `process` existen; sin declararlo
    // `no-undef` los reporta ciento veintidos veces y tapa lo que importa.
    files: ['tools/**/*.mjs', '*.config.js'],
    ...tseslint.configs.disableTypeChecked,
    languageOptions: {
      globals: globals.node,
      // `disableTypeChecked` apaga las reglas con tipos, pero el parser sigue
      // buscandole un tsconfig a cada archivo. Estos no estan en ninguno —son
      // scripts de Node, no parte de la compilacion— y sin esto el parseo
      // falla antes de llegar a la primera regla.
      parserOptions: { projectService: false, project: null },
    },
  },

  {
    // Lo que corre del lado del servidor tambien es Node.
    files: ['apps/web/**/*.ts', 'apps/web/**/*.tsx', 'packages/**/*.ts', '*.config.ts'],
    languageOptions: {
      globals: { ...globals.node, ...globals.browser },
    },
  },
)
