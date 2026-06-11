FROM node:24-alpine

# Native build tools required for better-sqlite3 bindings
RUN apk add --no-cache python3 make g++

RUN corepack enable && corepack prepare pnpm@11.5.2 --activate

WORKDIR /app

# Build context is the monorepo root — required for pnpm workspace resolution.
# In docker-compose.yml: build: { context: ., dockerfile: apps/auth/Dockerfile }
COPY . .

RUN pnpm install --frozen-lockfile

RUN pnpm --filter @sovereignfs/auth build

EXPOSE 3001

CMD ["pnpm", "--filter", "@sovereignfs/auth", "start"]
