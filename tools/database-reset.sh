#!/usr/bin/env bash
set -euo pipefail

echo "Resetting Prisma database..."
yarn prisma migrate reset --force

echo "Cleaning uploads directory..."
# find ./data/* -mindepth 1 ! -name '.gitkeep' -exec rm -rf {} +

echo "Done."
