#!/usr/bin/env bash
# Local startup: install deps, check config, apply migrations, run the dev server.
set -euo pipefail
cd "$(dirname "$0")/.."

if [ ! -f .env.local ]; then
  cp .env.example .env.local
  echo "Created .env.local from .env.example. Fill it in (see README) and re-run." >&2
  exit 1
fi

missing=()
while IFS='=' read -r key _; do
  case "$key" in ''|\#*) continue ;; esac
  value="$(grep -E "^${key}=" .env.local | tail -n1 | cut -d= -f2-)"
  [ -n "$value" ] || missing+=("$key")
done < .env.example
if [ ${#missing[@]} -gt 0 ]; then
  echo "Incomplete .env.local, empty: ${missing[*]}" >&2
  exit 1
fi

corepack enable >/dev/null 2>&1 || true
pnpm install --frozen-lockfile
pnpm db:migrate
exec pnpm dev "$@"
