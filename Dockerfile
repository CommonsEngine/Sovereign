# ---- Base image with small footprint ----
FROM node:22.15-alpine AS base
ENV CI=true
RUN apk add --no-cache libc6-compat

WORKDIR /app

# ---- Builder: install deps and build dist ----
FROM base AS builder
# If you use native modules: python3, make, g++ (uncomment below)
# RUN apk add --no-cache python3 make g++

# Leverage Docker layer caching: copy only manifests first
COPY package.json yarn.lock ./
# If you have a Yarn Berry (.yarn/*) repo, also:
# COPY .yarn .yarn
# COPY .yarnrc.yml .yarnrc.yml

# Workspace/package manifests (so Yarn can resolve workspaces without the whole tree yet)
COPY platform/package.json platform/package.json
# Copy manifests for ALL workspaces used by the monorepo (adjust the glob if needed)
COPY packages/*/package.json packages/*/package.json

# Install all deps (dev + prod) for build (Yarn v1 workspaces)
RUN corepack enable && yarn install --frozen-lockfile

# Now copy the rest of the code that’s needed for the build (sources)
COPY platform platform
COPY packages packages
COPY plugins plugins
COPY tools tools

# Prisma generate (so Prisma client matches image arch)
RUN yarn --cwd platform prisma generate

# Build the production bundle for the platform package (writes to platform/dist)
# If you have a workspace script: yarn workspace @sovereign/core build
RUN yarn --cwd platform build

# ---- Runner: minimal runtime with prod deps only ----
FROM base AS runner
ENV NODE_ENV=production \
    PORT=4000 \
    # Flip this to "src" to run source code with NODE_ENV=production for debugging
    SOVEREIGN_BOOTSTRAP=dist
ENV DATABASE_URL="file:/data/sovereign.db"
RUN mkdir -p /data
VOLUME ["/data"]

WORKDIR /app

# Copy only what's needed to run
# root
COPY --from=builder /app/package.json package.json
COPY --from=builder /app/yarn.lock yarn.lock
COPY --from=builder /app/plugins plugins
COPY --from=builder /app/tools tools
COPY --from=builder /app/packages packages

# platform
COPY --from=builder /app/platform/package.json platform/package.json
COPY --from=builder /app/platform/index.cjs platform/index.cjs
COPY --from=builder /app/platform/dist platform/dist
COPY --from=builder /app/platform/prisma platform/prisma
COPY --from=builder /app/platform/src platform/src
COPY --from=builder /app/platform/scripts platform/scripts
COPY --from=builder /app/platform/.env.example platform/.env

# Production node_modules (reuse from builder to avoid reinstall)
# If you want a slimmer image and your build is fully bundled, you can instead
# run: `yarn workspaces focus --production @sovereign/core` during build and
# copy only focused node_modules. Keeping it simple & robust here:
COPY --from=builder /app/node_modules node_modules
COPY --from=builder /app/platform/node_modules platform/node_modules

# Optional: add a tiny entrypoint that runs prisma migrate deploy when DATABASE_URL is set
COPY docker/entrypoint.sh docker-entrypoint.sh
RUN chmod +x docker-entrypoint.sh

RUN apk add --no-cache curl
EXPOSE 4000

# Healthcheck hits your /readyz (implement in server if not already)
HEALTHCHECK --interval=30s --timeout=3s --retries=5 CMD curl -fsS http://127.0.0.1:${PORT}/readyz || exit 1

ENTRYPOINT ["./docker-entrypoint.sh"]
# Start via dist by default (matches your new arch). You can flip to src by setting SOVEREIGN_BOOTSTRAP=src.
CMD ["node", "platform/index.cjs"]
