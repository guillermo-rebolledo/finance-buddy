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
# Optional provider/native settings in .env.example must not block startup.
for key in DATABASE_URL BETTER_AUTH_URL BETTER_AUTH_SECRET GOOGLE_CLIENT_ID GOOGLE_CLIENT_SECRET; do
  value="$(grep -E "^${key}=" .env.local | tail -n1 | cut -d= -f2- || true)"
  [ -n "$value" ] || missing+=("$key")
done
if [ ${#missing[@]} -gt 0 ]; then
  echo "Incomplete .env.local, empty: ${missing[*]}" >&2
  exit 1
fi

corepack enable >/dev/null 2>&1 || true
pnpm install --frozen-lockfile
pnpm db:migrate
exec pnpm dev "$@"
