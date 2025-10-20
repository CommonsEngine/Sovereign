#!/usr/bin/env sh
set -eu

# Ensure data directory exists (should be mounted volume)
mkdir -p /app/data

# Run prisma migrations (for sqlite this will just ensure schema); ignore failure to keep backwards compat
yarn prisma db push --accept-data-loss >/tmp/prisma.log 2>&1 || {
  echo "[entrypoint] prisma db push failed; see /tmp/prisma.log" >&2
}

exec "$@"
