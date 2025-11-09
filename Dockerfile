# syntax=docker/dockerfile:1.7

# ---------- Base dependencies ----------
FROM node:22-bookworm-slim AS base

# set workdir and install common deps
WORKDIR /app
RUN --mount=type=cache,target=/var/cache/apt \
    apt-get update \
 && apt-get install -y --no-install-recommends ca-certificates curl git tini openssl \
 && rm -rf /var/lib/apt/lists/*

# Use Corepack to pin Yarn deterministically
ENV COREPACK_ENABLE_DOWNLOAD_PROMPT=0
RUN corepack enable && corepack prepare yarn@1.22.22 --activate

# ---------- Dependencies layer ----------
FROM base AS deps

# Copy package manager files
COPY package.json yarn.lock ./

# IMPORTANT: skip lifecycle scripts here (prevents running prepare/build before sources exist)
# RUN --mount=type=cache,target=/usr/local/share/.cache/yarn \
#    yarn install --frozen-lockfile --ignore-scripts

# Disable optional deps (argon2 has native build, still install)
RUN yarn install --frozen-lockfile

# ---------- Build layer ----------
FROM deps AS build

# Reuse node_modules from deps
COPY --from=deps /app/node_modules ./node_modules
# Bring in source (exclude by .dockerignore later)
COPY . .

# Generate prisma client & build sources
RUN yarn prisma generate \
 && yarn build

# ---------- Production runtime ----------
FROM node:22-bookworm-slim AS runtime

WORKDIR /app
ENV NODE_ENV=production
ENV PORT=5000
ENV DATABASE_URL="file:/app/data/sovereign.db"

# Corepack for Yarn in runtime too (optional if you don't use yarn here)
ENV COREPACK_ENABLE_DOWNLOAD_PROMPT=0
RUN corepack enable && corepack prepare yarn@1.22.22 --activate

# Bring built app and prisma **artifacts** (client + engine) from build
# Copy the platform app since the runtime entry is /platform/index.cjs
COPY --from=build /app/platform ./platform
COPY --from=build /app/prisma ./prisma

# Copy Prisma client output generated during build (so we don't need prisma CLI now)
COPY --from=build /app/node_modules/@prisma ./node_modules/@prisma
COPY --from=build /app/node_modules/.prisma ./node_modules/.prisma

# Copy node_modules from build (matches built artifacts and avoids registry lookups)
COPY --from=build /app/node_modules ./node_modules

# Copy build artifacts and required folders
COPY --from=build /app/package.json ./package.json

# Prepare persistent data directory for sqlite
RUN mkdir -p /app/data \
    && chown node:node /app/data

# Copy entrypoint script
COPY docker/entrypoint.sh /entrypoint.sh
RUN chmod +x /entrypoint.sh

USER node

EXPOSE 5000

ENTRYPOINT ["/usr/bin/tini", "--", "/entrypoint.sh"]
CMD ["node", "platform/index.cjs"]
