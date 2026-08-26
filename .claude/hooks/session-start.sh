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
# Y deja a la vista lo otro que hace falta antes de tocar codigo: que esta
# haciendo la otra maquina. Este repositorio se trabaja desde dos cuentas y dos
# portatiles, y las dos sesiones de Claude no se hablan entre ellas — lo unico
# que comparten es el remoto. Una sesion que arranca sin mirarlo repite trabajo
# que ya esta hecho, y eso paso.
#
# Idempotente: se puede correr dos veces sin romper nada.

set -euo pipefail

cd "${CLAUDE_PROJECT_DIR:-.}"

# ── Que hay abierto ─────────────────────────────────────────────────────────
# Corre en las dos, en la web y en una maquina propia: es justamente en las
# maquinas propias donde estan las dos cuentas que se pisan. Nada de esto puede
# tumbar el arranque, asi que todo va con su salida de emergencia.

if git rev-parse --git-dir >/dev/null 2>&1; then
  git fetch --prune --quiet origin 2>/dev/null || true

  echo ""
  echo "Ramas en el remoto, de la mas reciente a la mas vieja:"
  git for-each-ref refs/remotes/origin \
    --sort=-committerdate \
    --format='  %(refname:lstrip=3)%09%(committerdate:relative)%09%(contents:subject)' \
    2>/dev/null | grep -v '^  HEAD' | head -8 || true

  # `gh` no esta en todas partes. Donde esta, los pull requests abiertos dicen
  # mas que las ramas: una rama puede ser un resto y un PR es trabajo esperando.
  if command -v gh >/dev/null 2>&1; then
    echo ""
    echo "Pull requests abiertos:"
    gh pr list --state open --limit 8 \
      --json number,title,headRefName,updatedAt \
      --template '{{range .}}  #{{.number}}  {{.title}}  ({{.headRefName}}){{"\n"}}{{end}}' \
      2>/dev/null || echo "  (gh no pudo consultarlos)"
  fi

  echo ""
  echo "Antes de empezar: si una de esas es lo que te acaban de pedir, continuala"
  echo "en vez de abrir otra. Y empuja tu rama al primer commit, no al ultimo:"
  echo "es lo unico que le avisa a la otra maquina que esto ya esta tomado."
  echo ""
fi

# ── Dependencias ────────────────────────────────────────────────────────────
# Solo en la web. En una maquina propia el entorno ya es del dueño y no le
# corresponde a un hook decidir cuando reinstalar sus dependencias.
if [ "${CLAUDE_CODE_REMOTE:-}" != "true" ]; then
  exit 0
fi

# `ci` y no `install`, aunque `install` aproveche mejor el cache del contenedor.
# La razon es que `install` reescribe el lockfile cuando el npm que corre aca es
# mas viejo que el que lo genero: le borra la metadata `libc` de los paquetes
# opcionales por plataforma, noventa lineas que despues aparecen como cambios
# sin commitear en cada sesion. Eso termina en uno de dos finales malos — o
# alguien commitea la degradacion, o todos aprenden a ignorar un arbol sucio.
# `ci` lee el lockfile y no lo escribe nunca. Medido, la diferencia es de
# segundos: 11s contra 8s.
#
# Si el lockfile y el package.json no coinciden, `ci` falla a proposito. Ahi si
# vale `install`, que los reconcilia: es preferible una sesion que arranca con
# un aviso a una que no arranca.
if ! npm ci --no-audit --no-fund; then
  echo "npm ci fallo — el lockfile y el package.json no coinciden. Cayendo a npm install." >&2
  echo "Revisa 'git status': el lockfile puede haber quedado modificado." >&2
  npm install --no-audit --no-fund
fi

# Los paquetes compilados son lo que consume la app de Next. La suite no los
# necesita, pero `npm run typecheck` y `next build` si, y compilarlos aca cuesta
# segundos y ahorra un error confuso mas adelante.
npm run build:paquetes
