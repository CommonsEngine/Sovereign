# syntax=docker/dockerfile:1.7

ARG NODE_IMAGE=node:22-bookworm-slim

# ---------- Base image with tooling ----------
FROM ${NODE_IMAGE} AS base

WORKDIR /app

RUN --mount=type=cache,target=/var/cache/apt \
    apt-get update \
 && apt-get install -y --no-install-recommends ca-certificates curl git openssh-client tini \
 && rm -rf /var/lib/apt/lists/*

# Use Corepack to pin Yarn deterministically
ENV COREPACK_ENABLE_DOWNLOAD_PROMPT=0
RUN corepack enable && corepack prepare yarn@1.22.22 --activate

# ---------- Builder ----------
FROM base AS build

ARG BUILD_SHA=dev
ARG BUILD_TAG=local

# Install dependencies (cached). Force dev deps to be present even though we later build for production.
COPY package.json yarn.lock ./
COPY . .
RUN --mount=type=cache,target=/usr/local/share/.cache/yarn \
    NODE_ENV=development yarn install --frozen-lockfile

# Prepare Prisma schema, migrations, seeds (writes sqlite DB under /app/data)
ENV NODE_ENV=production
ENV DATABASE_URL=file:/app/data/sovereign.db
RUN mkdir -p /app/data \
 && yarn prepare:all

# Build workspaces and manifest/openapi (prebuild hook regenerates manifest)
RUN NODE_ENV=production yarn build

# ---------- Runtime ----------
FROM ${NODE_IMAGE} AS runtime
ARG BUILD_SHA=dev
ARG BUILD_TAG=local
WORKDIR /app

ENV NODE_ENV=production
ENV PORT=4000
ENV DATABASE_URL="file:/app/data/sovereign.db"

# Corepack for runtime (keeps Yarn available for scripts)
ENV COREPACK_ENABLE_DOWNLOAD_PROMPT=0
RUN --mount=type=cache,target=/var/cache/apt \
    apt-get update \
 && apt-get install -y --no-install-recommends ca-certificates tini \
 && rm -rf /var/lib/apt/lists/* \
 && corepack enable && corepack prepare yarn@1.22.22 --activate

LABEL org.opencontainers.image.revision="${BUILD_SHA}" \
      org.opencontainers.image.version="${BUILD_TAG}"

# Copy built artifacts and runtime assets
COPY --from=build /app/package.json ./package.json
COPY --from=build /app/yarn.lock ./yarn.lock
COPY --from=build /app/node_modules ./node_modules
COPY --from=build /app/platform ./platform
COPY --from=build /app/plugins ./plugins
COPY --from=build /app/tools ./tools
COPY --from=build /app/data ./data
COPY --from=build /app/platform/prisma ./prisma
COPY --from=build /app/manifest.json ./manifest.json
COPY --from=build /app/openapi.json ./openapi.json

VOLUME ["/app/data"]

# Entry + runtime prep
COPY docker/entrypoint.sh /entrypoint.sh
RUN chmod +x /entrypoint.sh \
 && mkdir -p /app/data \
 && chown -R node:node /app/data

USER node

EXPOSE 4000

ENTRYPOINT ["/usr/bin/tini", "--", "/entrypoint.sh"]
CMD ["node", "platform/index.cjs"]
