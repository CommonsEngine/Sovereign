# syntax=docker/dockerfile:1.7

# ---------- Base dependencies ----------
FROM node:22-bookworm-slim AS base

# set workdir and install common deps
WORKDIR /app
RUN apt-get update \
    && apt-get install -y --no-install-recommends \
        ca-certificates \
        curl \
        git \
    && rm -rf /var/lib/apt/lists/*

# ---------- Dependencies layer ----------
FROM base AS deps

# Copy package manager files
COPY package.json yarn.lock ./

# Disable optional deps (argon2 has native build, still install)
RUN yarn install --frozen-lockfile

# ---------- Build layer ----------
FROM deps AS build

# Bring in source (exclude by .dockerignore later)
COPY . .

# Generate prisma client & build app
RUN yarn prisma generate \
 && yarn build

# ---------- Production runtime ----------
FROM node:22-bookworm-slim AS runtime

WORKDIR /app
ENV NODE_ENV=production
ENV PORT=5000
ENV DATABASE_URL="file:/app/data/sovereign.db"

# Install tini for proper signal handling
RUN apt-get update \
    && apt-get install -y --no-install-recommends tini openssl \
    && rm -rf /var/lib/apt/lists/*

# Copy production node_modules from deps
COPY --from=deps /app/node_modules ./node_modules

# Copy build artifacts and required folders
COPY --from=build /app/dist ./dist
COPY --from=build /app/public ./public
COPY --from=build /app/prisma ./prisma
COPY --from=build /app/package.json ./package.json

# Ensure Prisma client is generated for the runtime environment
RUN yarn prisma generate

# Prepare persistent data directory for sqlite
RUN mkdir -p /app/data \
    && chown node:node /app/data

# Copy entrypoint script
COPY docker/entrypoint.sh /entrypoint.sh
RUN chmod +x /entrypoint.sh

USER node

EXPOSE 5000

ENTRYPOINT ["/usr/bin/tini", "--", "/entrypoint.sh"]
CMD ["node", "dist/index.mjs"]
