# Sovereign — Implementation Task Breakdown

**Version:** 0.4
**Date:** June 2026
**Purpose:** Session-by-session task guide for Claude Code. Each task is a single PR. Reference `sovereign-proposal-plan-srs.md` for architectural decisions and rationale.

---

## How to use this document

Each task maps to one Claude Code session and one PR. Before starting a session:

1. Provide Claude Code with the relevant SRS sections as context
2. Provide this document and point to the specific task
3. Review the PR before moving to the next task — no task should start on an unmerged PR

Tasks are sequenced — each depends on the previous unless marked **[parallel]**.

**TypeScript config dependency:** All packages and apps created from Task 0.3.04 onwards must extend from `packages/tsconfig`. Remind Claude Code of this at the start of each package creation session — it is a foundational dependency established in 0.3.02 and easy to miss.

**Code quality dependency:** ESLint and Prettier are established in Task 0.3.03. All packages created from 0.3.04 onwards must comply with the root ESLint and Prettier config. Do not introduce per-package formatting overrides.

**Docker Compose scope:** Task 0.3.12 creates a basic dev-only Compose setup. Task 0.5.02 makes it production-complete. These are intentionally split — do not flag 0.5.02 as duplication.

---

## Phase v0.3 — Foundation

### Task 0.3.01 — Monorepo scaffold

**Goal:** Bare monorepo structure with pnpm workspaces and Turborepo configured. No application code.

**Deliverables:**

- Root `package.json` with pnpm workspace config
- `pnpm-workspace.yaml` declaring `apps/*`, `packages/*`, `plugins/*`, `runtime`
- `turbo.json` with basic pipeline: `build`, `dev`, `lint`, `typecheck`
- Empty directories: `apps/`, `packages/`, `plugins/`, `runtime/`, `scripts/`, `bin/`, `docs/`, `data/`
- `scripts/install-plugins.ts` — stub only: reads a `sovereign.plugins.json` config file at repo root, logs "not yet implemented". Full implementation in Task 0.5.00.
- Root `.gitignore` covering `node_modules`, `dist`, `.next`, `data/*.db`, `runtime/app/plugins/`
- Root `README.md` — one paragraph, links to SRS doc

**SRS reference:** 2.3 Monorepo Structure, 2.2 Tech Stack

**Review checklist:**

- `pnpm install` runs without errors
- `turbo build` runs without errors (no-ops since no packages exist yet)
- Directory structure matches SRS 2.3 exactly

---

### Task 0.3.02 — Shared TypeScript config

**Goal:** Centralised TypeScript configuration inherited by all packages and apps.

**Deliverables:**

- `packages/tsconfig/` package with:
  - `base.json` — strict mode, path aliases, target ES2022
  - `nextjs.json` — extends base, Next.js specific settings
  - `library.json` — extends base, for non-Next packages
- Each future package/app will extend one of these

**SRS reference:** 2.2 Tech Stack

**Review checklist:**

- `packages/tsconfig/package.json` correctly exports all three configs
- Configs are strict — `strict: true`, `noUncheckedIndexedAccess: true`

---

### Task 0.3.03 — Code quality tooling

**Goal:** Establish consistent code formatting and linting across the entire
monorepo before any application code is written. All subsequent tasks inherit
this baseline — nothing is merged without passing it.

**Deliverables:**

- `.editorconfig` at repo root — indent style (spaces, 2), line endings (LF),
  charset (UTF-8), trailing newline, trim trailing whitespace
- `prettier.config.ts` at repo root — single quotes, semicolons, trailing
  commas (`all`), print width 100, tab width 2
- `eslint.config.ts` at repo root — ESLint 9 flat config:
  - `typescript-eslint` recommended + strict rules
  - `eslint-config-prettier` to disable formatting rules that conflict with
    Prettier
  - `no-restricted-imports` rule scoped to `plugins/**` — blocks any import
    matching `*/runtime/src/*`. This is the SDK boundary rule (NFR-06); wiring
    it here means it is active from the first line of plugin code, not
    retroactively added in the SDK task
- `package.json` additions:
  - `simple-git-hooks` — pre-commit hook running lint-staged
  - `lint-staged` — runs `prettier --write` then `eslint --fix` on staged
    `.ts`/`.tsx`/`.css`/`.json` files
  - Scripts: `"format": "prettier --write ."`, `"format:check": "prettier
--check ."`, `"lint:fix": "eslint --fix ."`
- `turbo.json` — confirm `lint` task is correctly wired across packages
- Run `pnpm format` on all existing files (`.gitignore`, `README.md`,
  `package.json`, `pnpm-workspace.yaml`, `turbo.json`,
  `scripts/install-plugins.ts`) and commit formatted output as part of this PR

**Technology:** ESLint 9 (flat config) + `typescript-eslint` + Prettier +
`eslint-config-prettier` + `simple-git-hooks` + `lint-staged`. See CLAUDE.md —
Code quality section. No Biome — ESLint is required for the custom
`no-restricted-imports` SDK boundary rule; running both would be redundant.

**SRS reference:** NFR-06, PLT-10, SRS §2.2 Tech Stack

**Review checklist:**

- `pnpm format:check` passes on all files in the repo
- `pnpm lint` passes with zero errors or warnings
- Attempting to commit a file with formatting errors is blocked by the
  pre-commit hook
- A test import of `runtime/src/anything` inside `plugins/` causes ESLint to
  error — boundary rule is live

---

### Task 0.3.04 — `packages/db` — Drizzle client factory

**Goal:** Shared database package providing a Drizzle client factory that supports both SQLite and PostgreSQL via a dialect flag.

**Deliverables:**

- `packages/db/` with:
  - `src/client.ts` — exports `createClient(config)` returning a Drizzle instance
  - `src/dialect.ts` — reads `DATABASE_URL` and `DB_DIALECT` env vars, returns correct dialect
  - `src/migrate.ts` — migration runner stub (accepts migration file paths, runs in order)
  - `src/schema/platform.ts` — platform tables: `tenants`, `users`, `sessions` with `tenant_id` on users
  - `src/index.ts` — barrel export
- `packages/db/package.json` with correct dependencies: `drizzle-orm`, `better-sqlite3`, `pg`
- `tsup.config.ts` — `entry: ['src/index.ts']`, `format: ['esm']`, `dts: true`, `clean: true`
- `package.json`:
  - `build` script: `tsup`
  - No `dev` script — `transpilePackages` in the consuming Next.js apps compiles
    this package's TypeScript source directly during dev; no watch build needed
  - `exports` field points to TypeScript source for workspace consumption:
    `{ ".": "./src/index.ts" }`. tsup overwrites this with `dist/` paths at
    build time for production/npm.

**SRS reference:** 3.7 Database Layer, 3.1 Deployment Model (tenant_id)

**Review checklist:**

- `createClient()` returns a working Drizzle instance for SQLite when `DB_DIALECT=sqlite`
- `tenant_id` present on `users` table
- Migration runner accepts an array of migration paths and runs them in order
- No direct database calls — only the factory and schema definitions

---

### Task 0.3.05 — `packages/manifest` — schema and validation

**Goal:** Manifest schema package providing TypeScript types and a validation function.

**Deliverables:**

- `packages/manifest/` with:
  - `src/types.ts` — full `SovereignManifest` interface and `Permission` type as defined in SRS section 5
  - `src/validate.ts` — `validateManifest(json): ValidationResult` — checks required fields, valid enum values, `repository` required when type is `sovereign` or `community`
  - `src/index.ts` — barrel export
- Unit tests covering: valid manifest passes, missing required field fails, invalid enum value fails, missing repository on sovereign type fails
- `tsup.config.ts` — `entry: ['src/index.ts']`, `format: ['esm']`, `dts: true`, `clean: true`
- `package.json`:
  - `build` script: `tsup`
  - No `dev` script — compiled by consuming apps via `transpilePackages`
  - `exports`: `{ ".": "./src/index.ts" }` for workspace; overwritten at publish

**SRS reference:** 3.8 Manifest System, Section 5 Plugin Manifest Reference

**Review checklist:**

- All fields from SRS Section 5 present in the TypeScript interface
- `shell`, `database`, `runtime`, `type` fields all typed correctly with correct enum values
- Validation tests pass

---

### Task 0.3.06 — `packages/mailer` — SMTP abstraction

**Goal:** Thin mailer package wrapping nodemailer with a simple `send()` interface.

**Deliverables:**

- `packages/mailer/` with:
  - `src/mailer.ts` — `createMailer(config)` factory, `send(options: MailOptions)` method
  - `src/types.ts` — `MailOptions`, `MailerConfig` interfaces
  - `src/index.ts` — barrel export
- Config reads from env: `SMTP_HOST`, `SMTP_PORT`, `SMTP_USER`, `SMTP_PASS`, `SMTP_FROM`
- Graceful no-op when SMTP is not configured (logs warning, does not throw)
- `tsup.config.ts` — `entry: ['src/index.ts']`, `format: ['esm']`, `dts: true`, `clean: true`
- `package.json`:
  - `build` script: `tsup`
  - No `dev` script — compiled by consuming apps via `transpilePackages`
  - `exports`: `{ ".": "./src/index.ts" }` for workspace; overwritten at publish

**SRS reference:** NFR-02 (email optional), SDK surface `sdk.mailer.send()`

**Review checklist:**

- `send()` accepts `to`, `subject`, `html`, `text`
- No-op behaviour when SMTP unconfigured — does not crash the runtime
- No hardcoded credentials anywhere

---

### Task 0.3.07 — `packages/ui` — Sovereign Design System scaffold

**Goal:** Sovereign Design System scaffold — two-tier CSS custom property token
architecture and one primitive component to validate the setup. This package is
a public contract for plugin developers; token names and component APIs must be
treated with the same versioning discipline as the SDK.

**Deliverables:**

- `packages/ui/` with:
  - `src/tokens/primitives.css` — raw scale tokens with `--sv-` prefix:
    colour palette (`--sv-grey-50` … `--sv-grey-950`), spacing scale
    (`--sv-space-1` … `--sv-space-16`), font sizes (`--sv-font-size-sm` …
    `--sv-font-size-2xl`), border radii (`--sv-radius-sm/md/lg`)
  - `src/tokens/semantic.css` — contextual tokens mapped from primitives:
    `--sv-color-surface`, `--sv-color-text-primary`, `--sv-color-text-muted`,
    `--sv-color-border`, `--sv-color-accent`, `--sv-shadow-card` etc. These are
    what plugin developers reference. Tenant theming overrides this layer only.
  - `src/components/Button/Button.tsx` — single primitive component using CSS
    Modules to validate the setup
  - `src/components/Button/Button.module.css` — styles referencing `--sv-*`
    tokens only; no hardcoded values
  - `src/index.ts` — barrel export
- Extends `packages/tsconfig` (`library.json`)
- Builds cleanly and is importable by the runtime
- `docs/design-system.md` — foundational design system doc covering:
  - Design principles (what Sovereign UI should feel and look like)
  - Token architecture (two-tier model, `--sv-*` convention, primitive vs
    semantic, theming surface)
  - Full primitive and semantic token reference (all tokens defined in this task)
  - Component contribution guide (how to build a new component correctly —
    CSS Modules, token-only values, accessibility expectations)
  - Theming guide (how tenant overrides work by swapping semantic tokens at
    `:root`; what primitives are and why plugins must not reference them)

  Note: the plugin developer consumption guide (how to use components and tokens
  in a plugin) lives in `docs/plugin-development.md` (Task 0.5.06), not here.
  This doc is for contributors and system-level understanding.

**Technology:** CSS custom properties for tokens (plain `.css` files) + React +
CSS Modules for components. No Tailwind. No runtime CSS-in-JS. No third-party
component framework. See CLAUDE.md — Design System section for full rationale
and token conventions.

**Build:** `tsup` — ESM output, TypeScript declarations, CSS files marked as
external (`external: [/\.css$/]`). tsup does not process CSS Modules; the
consuming Next.js app (runtime) handles them natively. Token CSS files
(`.css`, not `.module.css`) are plain CSS — tsup copies them to `dist/` via
`loader: { '.css': 'copy' }` so they are importable as side-effect imports
by the runtime shell.

- `tsup.config.ts` — entry: `['src/index.ts']`, format: `['esm']`, dts: true,
  clean: true, external: `[/\.css$/]`, loader: `{ '.css': 'copy' }`
- `package.json`:
  - `build` script: `tsup`
  - No `dev` script — consuming Next.js apps (runtime) include this package in
    `transpilePackages`; Next.js compiles the TypeScript source directly and
    handles CSS Modules natively. Changes to components are picked up by HMR
    instantly without any watch build.
  - `exports`: `{ ".": "./src/index.ts" }` for workspace; tsup overwrites with
    `dist/` paths at build time. Published to npm as `@sovereignfs/ui`.
  - `files` field must include `dist/` and any CSS files for the npm package

**SRS reference:** 2.2 Tech Stack (`packages/ui`)

**Review checklist:**

- `Button` renders without errors when imported into a test file
- No hardcoded colour, spacing, or radius values in any component CSS — only
  `--sv-*` token references
- All semantic tokens map to primitive tokens — no semantic token has a
  hardcoded value
- `tokens/primitives.css` and `tokens/semantic.css` are valid, importable CSS
  files
- `docs/design-system.md` exists and covers all sections listed above

---

### Task 0.3.08 — `packages/sdk` — interface definitions

**Goal:** SDK package with full interface definitions for v1 surface. Implementations are stubs at this stage — real implementations come in later tasks.

**Deliverables:**

- `packages/sdk/` with:
  - `src/types.ts` — `Session`, `PlatformConfig`, `MailOptions`, `DrizzleClient` types
  - `src/auth.ts` — `getSession()`, `requireSession()` — stubs throwing `NotImplementedError`
  - `src/db.ts` — `getClient()` — stub
  - `src/mailer.ts` — `send()` — stub
  - `src/platform.ts` — `getConfig()` — stub
  - `src/unimplemented.ts` — `storage`, `notifications`, `events` stubs throwing `NotImplementedError` with message indicating v1 non-implementation
  - `src/index.ts` — barrel export as `sdk.*`

Note: the `no-restricted-imports` ESLint boundary rule blocking `runtime/src`
imports in `plugins/*` is configured in Task 0.3.03 (code quality tooling),
not here. By the time this task runs it is already active. This task only
verifies it catches a violation.

**Build:** `tsup` — ESM only, TypeScript declarations. Published to npm as
`@sovereignfs/sdk`; `package.json` must include `exports`, `main`, `types`,
and `files` fields pointing to `dist/`.

- `tsup.config.ts` — entry: `['src/index.ts']`, format: `['esm']`, dts: true,
  clean: true
- `package.json`:
  - `build` script: `tsup`
  - No `dev` script — compiled by consuming apps via `transpilePackages`
  - `exports`: `{ ".": "./src/index.ts" }` for workspace; overwritten at publish
  - `files` must include `dist/` for the npm package

**SRS reference:** 3.6 SDK, NFR-06

**Review checklist:**

- All SDK methods from SRS 3.6 present
- Unimplemented stubs throw `NotImplementedError` with a clear message
- ESLint import boundary rule catches a `runtime/src` import in a test plugin
  file (rule was established in Task 0.3.03)

---

### Task 0.3.09 — `apps/auth` — better-auth server **[parallel with 0.3.10]**

**Goal:** Auth server wrapping better-auth. Handles login, logout, registration, and session verification.

**Deliverables:**

- `apps/auth/` — Next.js app with:
  - better-auth configured with email/password provider
  - Session stored as httpOnly cookie
  - `/api/auth/[...all]` — better-auth catch-all handler
  - `/api/verify` — internal endpoint: validates session token, returns user object or 401
  - Invite-only toggle via `AUTH_INVITE_ONLY` env var
  - First user auto-assigned `platform:admin`, subsequent users `platform:user`
  - Environment: `AUTH_SECRET`, `DATABASE_URL`, `AUTH_INVITE_ONLY`
- `apps/auth/next.config.ts` — must include:
  - `transpilePackages: ['@sovereignfs/db', '@sovereignfs/mailer']` — compiles
    workspace package TypeScript source directly; no watch build needed in dev

**SRS reference:** 3.3 Auth Layer, 4.3 Functional Requirements — Auth

**Review checklist:**

- Login sets httpOnly cookie
- `/api/verify` returns 401 for invalid/expired token
- First registered user gets `platform:admin`
- `AUTH_INVITE_ONLY=true` blocks registration without valid invite token
- `AUTH_SECRET` has no default value — throws on startup if unset

---

### Task 0.3.10 — Runtime scaffold **[parallel with 0.3.09]**

**Goal:** Sovereign Core Next.js app scaffold with shell layout, middleware, and plugin launcher page. No plugins wired yet.

**Deliverables:**

- `runtime/` — Next.js 15 app with App Router:
  - `app/(platform)/layout.tsx` — shell layout: sidebar + content area (desktop), header + content + footer (mobile)
  - `app/(platform)/page.tsx` — launcher page (empty plugin grid for now)
  - `app/plugins/` — empty directory with `.gitignore` (generated, never committed)
  - `src/middleware.ts` — reads session cookie, calls `apps/auth /api/verify` to validate session (v0.3 approach — see SRS AUTH-05 for v0.5 local verification target), redirects to `/login` if unauthenticated
  - `src/registry.ts` — reads `generated/registry.ts`, exports installed plugin list
  - `generated/registry.ts` — placeholder empty registry
  - `app/login/page.tsx` — login page pointing to `apps/auth`
- `runtime/next.config.ts` — must include:
  - `transpilePackages: ['@sovereignfs/sdk', '@sovereignfs/ui',
'@sovereignfs/db', '@sovereignfs/manifest', '@sovereignfs/mailer']` —
    compiles all workspace package TypeScript sources directly during dev.
    Changes to any package file trigger HMR in the runtime without a separate
    watch build. (All packages share the single `@sovereignfs/*` scope; only
    `sdk` and `ui` are published, the rest are `private`.)
  - `webpack: (config) => { config.resolve.symlinks = false; return config; }`
    — required for plugin HMR. Without this, webpack resolves symlinks to
    their real path before watching, breaking hot reload for plugin source
    files that are symlinked into `runtime/app/plugins/` by the generate
    script. Setting `symlinks: false` makes webpack watch the symlink path
    so edits to `plugins/[id]/app/` propagate via HMR immediately.
- `runtime/package.json` — `dev` script runs the generate script before
  starting the dev server: `tsx ../scripts/generate-registry.ts && next dev`.
  The generate script is run synchronously on startup (creates/updates
  symlinks), then Next.js dev server starts.
- Environment: `SOVEREIGN_AUTH_URL`, `SOVEREIGN_AUTH_SECRET`

**SRS reference:** 3.4 Runtime Layer, 3.10 Shared Login State, PLT-01, PLT-02, PLT-08

**Review checklist:**

- Unauthenticated request to `/` redirects to `/login`
- Shell renders correctly on desktop and mobile viewports
- `app/plugins/` is gitignored
- No hardcoded auth secret
- Editing a file in `packages/ui/src/` while `pnpm dev` is running triggers
  HMR in the runtime without any manual rebuild step
- Editing a file in `plugins/console/app/` triggers HMR in the runtime

---

### Task 0.3.11 — Generate script

**Goal:** Pre-build script that reads plugin manifests, validates them, and injects plugin routes into the runtime.

**Deliverables:**

- `scripts/generate-registry.ts`:
  - Scans `plugins/*/manifest.json`
  - Validates each manifest via `packages/manifest`
  - Fails with a clear error if any manifest is invalid
  - Writes `runtime/generated/registry.ts` — typed array of installed plugin manifests
  - In `development` mode: symlinks `plugins/[id]/app/` → `runtime/app/plugins/[id]/`
  - In `production` mode: copies `plugins/[id]/app/` → `runtime/app/plugins/[id]/`
  - Mode determined by `NODE_ENV`
  - `--watch` flag: when passed, watches the `plugins/` directory for new or
    removed plugin directories and re-runs the symlink/copy step automatically.
    Used by `runtime/package.json`'s `dev` script to keep the plugin route
    tree in sync while the Next.js dev server is running. A newly added plugin
    directory is symlinked immediately; developers may need to trigger a route
    refresh in Next.js (fast-refresh boundary), but no manual generate command
    is needed.
- `turbo.json` updated with two additions:
  - `generate` task: `dependsOn: ["packages/manifest#build"]`, outputs
    `["runtime/app/plugins/**", "runtime/generated/**"]`, `cache: false`
    (plugin file state is not cacheable)
  - `runtime#build` override: `dependsOn: ["generate", "^build"]` — ensures
    generate runs and all package deps are built before the runtime Next.js
    build starts. Without this, `next build` may run before plugins are
    composed in.
- `package.json` script: `"generate": "tsx scripts/generate-registry.ts"`

**SRS reference:** 3.9 Plugin Loading Model

**Review checklist:**

- Invalid manifest causes script to exit non-zero with a readable error
- `runtime/generated/registry.ts` is valid TypeScript after running
- Symlinks created in dev mode, copies in production mode
- Running generate with no plugins produces an empty registry without errors

---

### Task 0.3.12 — Docker Compose for local dev

**Goal:** Docker Compose setup orchestrating runtime and auth server for local development.

**Deliverables:**

- `docker-compose.yml` — two services on a shared network:
  - `runtime` — host-mapped `${RUNTIME_PORT:-3000}:3000`
  - `auth` — internal only; `expose: ["3001"]`, no host `ports` mapping. The
    runtime reaches it at `http://auth:3001` via `SOVEREIGN_AUTH_URL`.
- `docker-compose.prod.yml` — production overrides: runtime host port defaults
  to `${RUNTIME_PORT:-4000}:3000`; auth remains internal-only; both services
  get `restart: unless-stopped`.
- `.env.example` at repo root with all required env vars documented, including
  `RUNTIME_PORT`, `AUTH_PORT`, `SOVEREIGN_AUTH_URL`
- `docs/self-hosting.md` — getting started guide: clone, configure env, `docker compose up`

**SRS reference:** NFR-01, 2.4 Phased Roadmap v0.3, 3.1 Deployment Model (topology, ports)

**Review checklist:**

- `docker compose up` starts both services without errors
- Runtime is reachable at `localhost:3000` (dev)
- Auth server is **not** reachable from the host — only from the runtime
  container on the internal network
- `.env.example` covers every env var used across all packages

---

## Phase v0.4 — Console Plugin

### Task 0.4.01 — Console plugin scaffold

**Goal:** Console plugin directory structure, manifest, and basic routing wired into the runtime via the generate script.

**Deliverables:**

- `plugins/console/manifest.json` — type: `platform`, runtime: `native`, routePrefix: `/console`, adminOnly: true, shell: `default`
- `plugins/console/app/layout.tsx` — console shell layout
- `plugins/console/app/page.tsx` — console home (empty, links to sub-sections)
- `plugins/console/db/schema.ts` — no tables yet (console reads platform tables)
- `plugins/console/package.json`
- Running `pnpm generate` wires console into the runtime

**SRS reference:** 3.5 Plugin System, 4.4 Functional Requirements — Console, PLT-03

**Review checklist:**

- `/console` returns 403 for `platform:user`, accessible for `platform:admin`
- Generate script correctly picks up console manifest
- Console appears in launcher for admin users only

---

### Task 0.4.02 — Console: user management

**Goal:** User list, invite, role change, and deactivate/reactivate.

**Deliverables:**

- `plugins/console/app/users/page.tsx` — paginated user list: name, email, role, status, join date
- `plugins/console/app/users/invite/page.tsx` — invite form: generates invite token, sends email via `sdk.mailer`
- Role change and deactivate/reactivate as server actions
- SDK `auth` and `mailer` real implementations wired in this task as a prerequisite for Console to function. `db` and `platform` implementations remain as stubs and are completed in Task 0.5.05.

**SRS reference:** CON-02, CON-03, CON-04, CON-05

**Review checklist:**

- User list shows all users with correct data
- Invite email sends (or logs no-op) when SMTP unconfigured
- Role change persists correctly
- Deactivated user cannot log in

---

### Task 0.4.03 — Console: plugin management

**Goal:** Installed plugin list with enable/disable toggle.

**Deliverables:**

- `plugins/console/app/plugins/page.tsx` — list of installed plugins from registry: name, version, type, status
- Enable/disable toggle as server action — writes to a `plugin_status` table in platform db
- Runtime middleware respects disabled status — returns 404 for disabled plugin routes
- Disabled plugins hidden from launcher

**SRS reference:** CON-06, CON-07, PLT-04

**Review checklist:**

- Disabling a plugin blocks its routes immediately (no rebuild required)
- Disabled plugin disappears from launcher
- Re-enabling restores access

---

### Task 0.4.04 — Console: tenant settings and system health

**Goal:** Tenant name configuration and system health dashboard.

**Deliverables:**

- `plugins/console/app/settings/page.tsx` — tenant name field, invite-only toggle
- `plugins/console/app/health/page.tsx` — runtime version, database type + connection status, auth server status, disk usage
- Tenant name stored in `tenants` table, exposed via `sdk.platform.getConfig()`
- Invite-only toggle writes to `tenants` table, auth server reads it on registration

**SRS reference:** CON-08, CON-09, CON-10, PLT-06

**Review checklist:**

- Tenant name change reflects in `sdk.platform.getConfig()` immediately
- Health page shows accurate database type (SQLite vs Postgres)
- Invite-only toggle takes effect on next registration attempt without restart

---

## Phase v0.5 — Polish and Self-Hosting

### Task 0.5.00 — `scripts/install-plugins.ts` — plugin install script

**Goal:** Full implementation of the install script stubbed in Task 0.3.01.

**Deliverables:**

- `sovereign.plugins.json` at repo root — config file declaring which sovereign/community plugins to install:
  ```json
  {
    "plugins": [
      {
        "id": "com.sovereign.tasks",
        "repository": "https://github.com/CommonsEngine/sovereign-plugin-tasks"
      },
      {
        "id": "com.sovereign.splitify",
        "repository": "https://github.com/CommonsEngine/sovereign-plugin-splitify"
      }
    ]
  }
  ```
- `scripts/install-plugins.ts` — reads `sovereign.plugins.json`, clones each repository into `plugins/[id]/` if not already present, skips if directory exists, runs `pnpm generate` after all plugins are installed
- `package.json` script: `"install:plugins": "tsx scripts/install-plugins.ts"`

**SRS reference:** 2.3 Monorepo Structure, 3.5 Plugin System

**Review checklist:**

- Running script clones declared plugins into correct directories
- Already-cloned plugins are skipped without error
- `pnpm generate` runs automatically after install
- Script fails clearly if a repository URL is unreachable

### Task 0.5.01 — PWA configuration

**Goal:** Runtime configured as an installable PWA.

**Deliverables:**

- `@ducanh2912/next-pwa` configured in `runtime/next.config.ts`
- `public/manifest.json` — PWA manifest: name, icons, theme colour
- Service worker caching shell and static assets
- App installable from Chrome and Safari

**SRS reference:** 3.11 PWA, PLT-09

**Review checklist:**

- Lighthouse PWA audit passes
- App installable on desktop Chrome and mobile Safari
- Offline load shows shell (not blank page)

---

### Task 0.5.02 — Production Docker image

**Goal:** Separate production Docker images for runtime and auth, each built
from Next.js standalone output.

**Deliverables:**

- `Dockerfile` (runtime) — three-stage:
  - `deps` — `node:<pinned>-alpine` + corepack pnpm; install with
    `--frozen-lockfile`
  - `builder` — copy source; `NODE_ENV=production`; run `pnpm generate`
    (copies plugins, not symlinks) then `pnpm build` (tsup packages → next
    build, producing `.next/standalone`)
  - `runner` — minimal image, non-root user, `NODE_ENV=production`; copy only
    `.next/standalone` + `.next/static` + `public`; `EXPOSE 3000`;
    `HEALTHCHECK` hitting the runtime health endpoint; `CMD ["node", "server.js"]`
- `apps/auth/Dockerfile` — same three-stage pattern for the auth server;
  `EXPOSE 3001`; auth-specific healthcheck
- Both apps set `output: 'standalone'` in their `next.config.ts` (prerequisite)
- `docker-compose.prod.yml` updated to build/use these images; runtime
  host-mapped (default 4000), auth internal-only, both `restart: unless-stopped`
- No secrets baked into images — all config injected at runtime via env

**SRS reference:** NFR-01, 2.4 Phased Roadmap v0.5, 3.1 Deployment Model

**Review checklist:**

- Images build without errors
- Each image is reasonably small (standalone output keeps them lean; target
  < 250MB per image)
- Login → session cookie → authenticated request works end-to-end across the
  two production containers (runtime → auth over the internal network)
- Auth container is not reachable from the host
- No dev dependencies and no secrets in the production images

---

### Task 0.5.03 — Postgres validation

**Goal:** Confirm full parity between SQLite and Postgres deployments.

**Deliverables:**

- `docker-compose.prod.yml` updated with a Postgres service variant
- All migrations run cleanly against Postgres
- End-to-end smoke test: login, console access, plugin enable/disable — all working on Postgres
- `docs/self-hosting.md` updated with Postgres configuration section

**SRS reference:** NFR-03, 3.7 Database Layer

**Review checklist:**

- Switching `DB_DIALECT=postgres` and `DATABASE_URL` is the only change required
- No SQLite-specific queries anywhere in application code
- Migrations apply cleanly to a fresh Postgres instance

---

### Task 0.5.04 — `sv` CLI — core commands

**Goal:** `sv` CLI with essential commands for managing a Sovereign deployment.

**Deliverables:**

- `bin/sv` — TypeScript entry point, executed via `tsx` (no separate compile
  step; consistent with the `scripts/` pattern)
- Commands:
  - `sv install` — runs install script, clones sovereign/community plugins defined in config
  - `sv generate` — runs generate script
  - `sv build` — runs generate then pnpm build
  - `sv dev` — starts runtime and auth server in dev mode
  - `sv serve` — starts production server via direct node. PM2 is supported as
    an optional non-Docker deployment path — documented in `docs/self-hosting.md`
    but not the canonical production approach. Docker is canonical.
  - `sv plugin add <repository>` — clones a plugin, runs generate
  - `sv plugin remove <id>` — removes plugin directory, runs generate

**Technology:** `citty` (command framework) + `consola` (terminal output) —
both TypeScript-first, lightweight, from the UnJS ecosystem. `citty` handles
nested subcommands (`sv plugin add/remove`) cleanly. `consola` provides
consistent info/success/warn/error formatting. CLI is monorepo-internal in v1
— no global npm install path. See SRS §2.2 and decision log.

**SRS reference:** 2.4 Phased Roadmap v0.5, 2.2 Tech Stack

**Review checklist:**

- `sv dev` starts both services correctly
- `sv plugin add` clones and wires a plugin end-to-end
- `sv plugin remove` cleans up symlinks/copies and updates registry
- `sv --help` and `sv plugin --help` output accurate, well-formatted help text
- No compiled output — CLI runs directly via `tsx`

---

### Task 0.5.05 — SDK implementations (db and platform)

**Goal:** Complete remaining SDK implementations. `sdk.auth` and `sdk.mailer` were wired in Task 0.4.02. This task completes `sdk.db` and `sdk.platform`, and also upgrades middleware from `/api/verify` round-trips to local JWT verification.

**Deliverables:**

- `runtime/src/sdk/db.ts` — real `getClient()` returning scoped Drizzle instance
- `runtime/src/sdk/platform.ts` — real `getConfig()` reading from `tenants` table
- `runtime/src/middleware.ts` — updated to verify JWT locally using `SOVEREIGN_AUTH_SECRET` (replaces `/api/verify` round-trip per SRS AUTH-05)
- SDK package updated to re-export all runtime implementations when running inside runtime context

**SRS reference:** 3.6 SDK

**Review checklist:**

- `sdk.auth.requireSession()` throws when called from an unauthenticated context
- `sdk.db.getClient()` returns a working Drizzle instance
- `sdk.mailer.send()` delegates correctly to packages/mailer
- No stub implementations remain for the v1 SDK surface

---

### Task 0.5.06 — Documentation

**Goal:** Complete self-hosting and plugin developer documentation.

**Deliverables:**

- `docs/self-hosting.md` — complete: requirements, Docker deploy, env vars, first run, Postgres switch, upgrade path
- `docs/plugin-development.md` — complete: manifest reference, SDK usage, file structure, how to submit to registry
- `docs/architecture.md` — summary of SRS architecture sections for contributors
- `docs/upgrade.md` — versioned upgrade notes (v0.3 → v0.4 → v0.5)
- `README.md` updated — project overview, quick start, links to docs

**SRS reference:** NFR-10, 2.4 Phased Roadmap v1.0

**Review checklist:**

- A developer with no prior Sovereign knowledge can deploy from scratch following `self-hosting.md`
- Plugin developer guide covers all manifest fields with examples
- All env vars documented with descriptions and whether required or optional

---

### Task 0.5.07 — CI pipeline

**Goal:** GitHub Actions pipelines for continuous validation and npm publishing.

**Deliverables:**

- `.github/workflows/ci.yml` — validation, triggers on push to `main` and all
  pull requests:
  - `format` — runs `prettier --check .` across the repo; fails on any
    unformatted file
  - `lint` — runs ESLint across all packages including the SDK import boundary
    rule (NFR-06)
  - `typecheck` — runs `tsc --noEmit` across all packages
  - `generate-validate` — runs `pnpm generate --mode=prod` and verifies
    `runtime/generated/registry.ts` is valid TypeScript
  - `build` — runs `turbo build` in production mode
  - All jobs use pnpm cache for speed
- `.github/workflows/publish.yml` — npm publishing, **separate workflow**
  triggered on per-package version tags (the two packages have independent
  release cycles):
  - Tag pattern `sdk-v*.*.*` → builds and publishes `@sovereignfs/sdk`
  - Tag pattern `ui-v*.*.*` → builds and publishes `@sovereignfs/ui`
  - Steps: `pnpm install` → `pnpm --filter <pkg> build` (tsup → `dist/`) →
    `pnpm --filter <pkg> publish --no-git-checks --access public` using the
    `NODE_AUTH_TOKEN` repository secret
  - No other packages are ever published (internal `@sovereignfs/*` packages
    are `private` and workspace-only)
  - Publish runs only after the validation jobs pass on the tagged commit

**SRS reference:** SRS 3.9 (CI validation step), PLT-07, NFR-06, NFR-04

**Review checklist:**

- All five validation jobs pass on a clean checkout
- Unformatted file causes `format` job to fail
- Import boundary violation in a plugin causes `lint` job to fail
- Invalid manifest in `plugins/` causes `generate-validate` job to fail
- pnpm cache is correctly restored between runs
- Pushing an `sdk-v*` tag publishes only `@sovereignfs/sdk`;
  pushing a `ui-v*` tag publishes only `@sovereignfs/ui`
- A tag without a corresponding version bump in the package's `package.json`
  fails the publish (version already exists on npm)

### Task 1.0.01 — Registry contribution process

**Goal:** Define and document the process for submitting a community plugin to `registry/plugins.json`.

**Deliverables:**

- `registry/plugins.json` — initial structure with console as the only platform entry
- `registry/CONTRIBUTING.md` — submission requirements: manifest must be valid, repository must be public, must include LICENSE file, must target compatible platform version
- PR template for registry submissions
- `docs/plugin-development.md` updated with registry submission section

**SRS reference:** 2.7 Open Source Strategy, 3.8 Manifest System

**Review checklist:**

- `plugins.json` validates against manifest schema
- Submission requirements are clear and enforceable via manifest validation

---

### Task 1.0.02 — Stable SDK and semver commitment

**Goal:** SDK API review, cleanup, and semver commitment documented.

**Deliverables:**

- SDK API review — remove anything experimental or inconsistent
- `packages/sdk/CHANGELOG.md` — initial entry marking v1.0.0 as stable
- `docs/sdk-stability.md` — documents what stable means: patch = no breaking changes, minor = additive only, major = breaking with migration guide
- SDK package version bumped to `1.0.0`

**SRS reference:** NFR-04

**Review checklist:**

- No stub implementations remain in the v1 SDK surface
- All unimplemented stubs (storage, notifications, events) clearly marked as unstable/experimental
- Semver policy documented and linked from README

---

_Version 0.8 — June 2026. Changes from v0.7: npm scope unified to a single owned scope `@sovereignfs/_`for all packages (was split`@commonsengine/sovereign-_`+`@sovereign/_`); transpilePackages lists, package build/publish notes, and publish.yml updated accordingly; internal packages marked `private`. Earlier v0.7 changes (Docker two-container topology, three-stage prod images, ci.yml/publish.yml split) retained. Task breakdown covers platform only. Plugin-specific task breakdowns (Tasks, Splitify) are maintained in their respective repositories.\*
