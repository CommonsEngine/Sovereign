#!/usr/bin/env sh
set -eu

APP_DIR="/app"
DATA_DIR="${APP_DIR}/data"
PRISMA_BIN="${APP_DIR}/node_modules/.bin/prisma"
SCHEMA_PATH="${APP_DIR}/prisma/schema.prisma"

mkdir -p "$DATA_DIR"
: "${DATABASE_URL:=file:/app/data/sovereign.db}"
export DATABASE_URL

if [ ! -x "$PRISMA_BIN" ]; then
  echo "[entrypoint] Prisma CLI not found at ${PRISMA_BIN}" >&2
  exit 1
fi

echo "[entrypoint] Applying migrations (DATABASE_URL=${DATABASE_URL})"
if ! "$PRISMA_BIN" migrate deploy --schema "$SCHEMA_PATH" >/tmp/prisma.log 2>&1; then
  echo "[entrypoint] migrate deploy failed, falling back to db push (see /tmp/prisma.log)" >&2
  "$PRISMA_BIN" db push --accept-data-loss --schema "$SCHEMA_PATH" >/tmp/prisma.log 2>&1 || {
    echo "[entrypoint] prisma db push failed; see /tmp/prisma.log" >&2
    exit 1
  }
fi

exec "$@"
