#!/usr/bin/env sh
set -e

# Pass through environment to Node
export NODE_ENV="${NODE_ENV:-production}"
export PORT="${PORT:-4000}"

# Choose bootstrap target:
# - SOVEREIGN_BOOTSTRAP=dist  → platform/dist/bootstrap.js (production default)
# - SOVEREIGN_BOOTSTRAP=src   → platform/src/bootstrap.js  (debug prod env from source)
export SOVEREIGN_BOOTSTRAP="${SOVEREIGN_BOOTSTRAP:-dist}"

# Run Prisma migrations if DATABASE_URL is provided
if [ -n "$DATABASE_URL" ]; then
  echo "[entrypoint] Running prisma migrate deploy..."
  yarn --cwd platform prisma migrate deploy || {
    echo "[entrypoint] migrate deploy failed"; exit 1;
  }
else
  echo "[entrypoint] DATABASE_URL not set, skipping prisma migrate deploy"
fi

# Build manifest at runtime if missing (works for SQLite-only images)
if [ ! -f /app/manifest.json ]; then
  echo "[entrypoint] manifest.json not found; generating..."
  if yarn -s run | grep -q "build:manifest" >/dev/null 2>&1; then
    yarn build:manifest || { echo "[entrypoint] build:manifest failed"; exit 1; }
  else
    node tools/build-manifest.mjs || { echo "[entrypoint] tools/build-manifest.mjs failed"; exit 1; }
  fi
fi

# Optional: generate Prisma in runtime container if needed (usually done in build)
# yarn --cwd platform prisma generate || true

echo "[entrypoint] Starting Sovereign (NODE_ENV=${NODE_ENV}, bootstrap=${SOVEREIGN_BOOTSTRAP})"
exec "$@"
