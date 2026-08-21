#!/bin/bash
#
# Arranque de una sesion de Claude Code en la web.
#
# Deja el repo listo para lo unico que hace falta antes de tocar codigo: correr
# la suite y el typecheck. Sin esto, cada sesion empieza con un `npm install` a
# mano que tarda un minuto largo, y hasta que termina cualquier intento de
# correr un test falla por un modulo que no esta.
#
# Nada de esto necesita claves. Los tests apuntan al codigo fuente de los
# paquetes —`vitest.config.ts` los aliasea a `src`— y ni la suite ni el
# typecheck leen Supabase, asi que una sesion web es productiva sin tener una
# sola variable de entorno. Lo unico que si las pide es levantar la app de
# verdad con `npm run dev`; para eso esta el preview que Vercel publica en
# cada PR.
#
# Idempotente: se puede correr dos veces sin romper nada.

set -euo pipefail

# Solo en la web. En una maquina propia el entorno ya es del dueño y no le
# corresponde a un hook decidir cuando reinstalar sus dependencias.
if [ "${CLAUDE_CODE_REMOTE:-}" != "true" ]; then
  exit 0
fi

cd "${CLAUDE_PROJECT_DIR:-.}"

# `install` y no `ci`: el contenedor se cachea despues de que el hook termina, y
# `ci` borra `node_modules` cada vez, que es justo lo que el cache evita.
npm install --no-audit --no-fund

# Los paquetes compilados son lo que consume la app de Next. La suite no los
# necesita, pero `npm run typecheck` y `next build` si, y compilarlos aca cuesta
# segundos y ahorra un error confuso mas adelante.
npm run build:paquetes
