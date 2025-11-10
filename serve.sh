#!/usr/bin/env bash
set -Eeuo pipefail

# ───────────────────────────────
# Config (adjust if you like)
# ───────────────────────────────
APP_NAME="sovereign"
ECOSYSTEM_FILE="ecosystem.config.cjs"
STATE_DIR=".state"
PREPARED_FLAG="${STATE_DIR}/prepared"

# Where your runtime env vars live (consumed by Node’s --env-file via PM2 config)
ENV_FILE_DEFAULT="${HOME}/.config/sovereign.env"
ENV_FILE="${SOV_ENV_FILE:-$ENV_FILE_DEFAULT}"

# Default port for health if not in env file
DEFAULT_PORT="4000"

# ───────────────────────────────
# Helpers
# ───────────────────────────────
pm2_cmd() {
  if command -v pm2 >/dev/null 2>&1; then
    pm2 "$@"
  else
    npx pm2@latest "$@"
  fi
}

# Read a KEY=VAL from $ENV_FILE without exporting it into this shell
read_env() {
  local key="$1"
  [ -f "$ENV_FILE" ] || return 1
  awk -F= -v k="$key" '
    $0 !~ /^[[:space:]]*#/ && $0 ~ "=" {
      gsub(/^[[:space:]]+|[[:space:]]+$/, "", $1);
      if ($1 == k) { $1=""; sub(/^=/,""); print $0; exit }
    }' "$ENV_FILE" | tr -d '"' | tr -d "'"
}

health_url() {
  local port="${PORT:-}"
  if [ -z "$port" ]; then
    port="$(read_env PORT || true)"
    port="${port:-$DEFAULT_PORT}"
  fi
  echo "http://127.0.0.1:${port}/readyz"
}

run_if_script() {
  local name="$1"
  if yarn -s run 2>/dev/null | grep -q "^${name}$"; then
    echo "[serve] running: yarn ${name}"
    yarn "${name}"
  else
    echo "[serve] (skip) no yarn script '${name}'"
  fi
}

first_run_needed() {
  # Heuristics:
  #  - no node_modules OR
  #  - no platform/dist OR
  #  - no prepared flag
  if [ ! -d "node_modules" ] || [ ! -d "platform" ] || [ ! -d "platform/dist" ] || [ ! -f "$PREPARED_FLAG" ]; then
    return 0
  fi
  return 1
}

sanity_check() {
  local url
  url="$(health_url)"
  echo "[serve] sanity check → ${url}"
  for i in {1..30}; do
    if curl -fsS --max-time 2 "$url" >/dev/null 2>&1; then
      echo "[serve] ✅ healthy"
      return 0
    fi
    sleep 1
  done
  echo "[serve] ❌ health endpoint not responding; showing last logs"
  pm2_cmd logs "$APP_NAME" --lines 200 || true
  return 1
}

start_or_restart() {
  if pm2_cmd show "$APP_NAME" >/dev/null 2>&1; then
    echo "[serve] restarting ${APP_NAME}"
    pm2_cmd restart "$APP_NAME" --update-env
  else
    echo "[serve] starting ${APP_NAME}"
    pm2_cmd start "$ECOSYSTEM_FILE" --env production
  fi
  pm2_cmd save >/dev/null 2>&1 || true
}

full_build() {
  echo "[serve] installing deps…"
  (yarn install --frozen-lockfile || yarn install)

  echo "[serve] prepare:init (create .env from example if needed)…"
  run_if_script "prepare:init"

  echo "[serve] prepare:all…"
  run_if_script "prepare:all"

  echo "[serve] build…"
  run_if_script "build"

  echo "[serve] build:manifest (optional)…"
  run_if_script "build:manifest"

  mkdir -p "$STATE_DIR"
  date +"%FT%T%z" > "$PREPARED_FLAG"
}

usage() {
  cat <<EOF
Usage: ./serve.sh [--force-build] [--reseed-db] [--no-health]

Options:
  --force-build   Force full build even if already prepared
  --no-health     Skip the health check after (re)start
  --help          Show this help

Env:
  SOV_ENV_FILE    Path to env file consumed by Node --env-file (default: $ENV_FILE_DEFAULT)
                  (Configured inside ${ECOSYSTEM_FILE} node_args)
EOF
}

# ───────────────────────────────
# Parse flags
# ───────────────────────────────
FORCE_BUILD=0
DO_HEALTH=1
while [ $# -gt 0 ]; do
  case "$1" in
    --force-build) FORCE_BUILD=1 ;;
    --no-health)   DO_HEALTH=0 ;;
    --help|-h)     usage; exit 0 ;;
    *) echo "[serve] unknown option: $1"; usage; exit 1 ;;
  esac
  shift
done

# ───────────────────────────────
# Pre-flight
# ───────────────────────────────
mkdir -p "$STATE_DIR" logs

if [ ! -f "$ECOSYSTEM_FILE" ]; then
  echo "[serve] ERROR: ${ECOSYSTEM_FILE} not found in $(pwd)" >&2
  exit 1
fi

if ! command -v node >/dev/null 2>&1; then
  echo "[serve] ERROR: node is not installed or not in PATH" >&2
  exit 1
fi

# ───────────────────────────────
# Main
# ───────────────────────────────
if [ "$FORCE_BUILD" -eq 1 ] || first_run_needed; then
  echo "[serve] ===== First run (or forced) → full build ====="
  full_build
else
  echo "[serve] ===== Not first run → fast restart ====="
fi

start_or_restart

if [ "$DO_HEALTH" -eq 1 ]; then
  sanity_check
fi
