sudo -u sovereign bash -lc '
  set -euo pipefail
  cd /srv/sovereign
  git fetch --all --prune
  git checkout main
  git pull --ff-only
  corepack enable || true
  corepack prepare yarn@stable --activate || true
  yarn install --frozen-lockfile || yarn install
  yarn build
  yarn prisma migrate deploy
'
pm2 reload sovereign
