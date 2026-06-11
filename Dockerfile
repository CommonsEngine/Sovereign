FROM node:24-alpine

# Native build tools required for better-sqlite3 bindings
RUN apk add --no-cache python3 make g++

RUN corepack enable && corepack prepare pnpm@11.5.2 --activate

WORKDIR /app

COPY . .

RUN pnpm install --frozen-lockfile

# Generate plugin registry and symlinks before building
RUN pnpm run generate

RUN pnpm --filter @sovereignfs/runtime build

EXPOSE 3000

CMD ["pnpm", "--filter", "@sovereignfs/runtime", "start"]
