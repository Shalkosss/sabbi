#!/usr/bin/env bash
#
# Abre el pull request de una rama que Claude ya dejó publicada.
#
# Vive aparte de los workflows porque los dos que producen código terminan
# igual: si la rama no trae commits no se abre nada, y si ya hay un pull
# request abierto tampoco se abre otro. Espera estas variables de entorno:
#
#   RAMA      rama con el trabajo, ya empujada a origin
#   BASE      rama contra la que se propone (master)
#   TITULO    título del pull request
#   CUERPO    cuerpo del pull request, en markdown
#   BORRADOR  '1' para abrirlo como borrador; cualquier otra cosa, normal
#   GH_TOKEN  token para `gh`
set -euo pipefail

: "${RAMA:?falta RAMA}"
: "${BASE:?falta BASE}"
: "${TITULO:?falta TITULO}"
: "${CUERPO:?falta CUERPO}"

if ! git fetch --quiet origin \
  "+refs/heads/$BASE:refs/remotes/origin/$BASE" \
  "+refs/heads/$RAMA:refs/remotes/origin/$RAMA"; then
  echo "La rama $RAMA no existe en origin: la corrida no llegó a publicar nada."
  exit 0
fi

adelanto=$(git rev-list --count "origin/$BASE..origin/$RAMA")
if [ "$adelanto" -eq 0 ]; then
  echo "La rama $RAMA no trae commits sobre $BASE. No hay nada que proponer."
  exit 0
fi

abierto=$(gh pr list --head "$RAMA" --state open --json number --jq '.[0].number // empty')
if [ -n "$abierto" ]; then
  url=$(gh pr view "$abierto" --json url --jq .url)
  echo "El pull request #$abierto ya cubre esta rama y quedó actualizado: $url"
  echo "Pull request actualizado: $url" >> "$GITHUB_STEP_SUMMARY"
  exit 0
fi

extra=()
if [ "${BORRADOR:-}" = "1" ]; then
  extra+=(--draft)
fi

url=$(gh pr create --base "$BASE" --head "$RAMA" --title "$TITULO" --body "$CUERPO" "${extra[@]}")
echo "Pull request abierto: $url"
echo "Pull request abierto: $url" >> "$GITHUB_STEP_SUMMARY"
