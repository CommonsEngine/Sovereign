#!/usr/bin/env bash
set -euo pipefail

echo "- Resetting Prisma database..."
yarn prisma migrate reset --force

SCRIPT_DIR="$(cd -- "$(dirname "$0")" && pwd)"
ROOT_DIR="$(cd -- "$SCRIPT_DIR/../.." && pwd)"
DATA_DIR="$ROOT_DIR/data"

echo "- Cleaning data directory..."
if [ -d "$DATA_DIR" ]; then
  find "$DATA_DIR" -mindepth 1 ! -name '.gitkeep' -delete
fi

echo "✓ Done."
