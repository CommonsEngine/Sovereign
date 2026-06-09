# Sovereign v3 — Implementation Task Breakdown

**Version:** 0.2
**Date:** June 2026
**Purpose:** Session-by-session task guide for Claude Code. Each task is a single PR. Reference `sovereign-proposal-plan-srs.md` for architectural decisions and rationale.

---

## How to use this document

Each task maps to one Claude Code session and one PR. Before starting a session:
1. Provide Claude Code with the relevant SRS sections as context
2. Provide this document and point to the specific task
3. Review the PR before moving to the next task — no task should start on an unmerged PR

Tasks are sequenced — each depends on the previous unless marked **[parallel]**.

**TypeScript config dependency:** All packages and apps created from Task 0.3.03 onwards must extend from `packages/tsconfig`. Remind Claude Code of this at the start of each package creation session — it is a foundational dependency established in 0.3.02 and easy to miss.

**Docker Compose scope:** Task 0.3.11 creates a basic dev-only Compose setup. Task 0.5.02 makes it production-complete. These are intentionally split — do not flag 0.5.02 as duplication.

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

### Task 0.3.03 — `packages/db` — Drizzle client factory

**Goal:** Shared database package providing a Drizzle client factory that supports both SQLite and PostgreSQL via a dialect flag.

**Deliverables:**
- `packages/db/` with:
  - `src/client.ts` — exports `createClient(config)` returning a Drizzle instance
  - `src/dialect.ts` — reads `DATABASE_URL` and `DB_DIALECT` env vars, returns correct dialect
  - `src/migrate.ts` — migration runner stub (accepts migration file paths, runs in order)
  - `src/schema/platform.ts` — platform tables: `tenants`, `users`, `sessions` with `tenant_id` on users
  - `src/index.ts` — barrel export
- `packages/db/package.json` with correct dependencies: `drizzle-orm`, `better-sqlite3`, `pg`

**SRS reference:** 3.7 Database Layer, 3.1 Deployment Model (tenant_id)

**Review checklist:**
- `createClient()` returns a working Drizzle instance for SQLite when `DB_DIALECT=sqlite`
- `tenant_id` present on `users` table
- Migration runner accepts an array of migration paths and runs them in order
- No direct database calls — only the factory and schema definitions

---

### Task 0.3.04 — `packages/manifest` — schema and validation

**Goal:** Manifest schema package providing TypeScript types and a validation function.

**Deliverables:**
- `packages/manifest/` with:
  - `src/types.ts` — full `SovereignManifest` interface and `Permission` type as defined in SRS section 5
  - `src/validate.ts` — `validateManifest(json): ValidationResult` — checks required fields, valid enum values, `repository` required when type is `sovereign` or `community`
  - `src/index.ts` — barrel export
- Unit tests covering: valid manifest passes, missing required field fails, invalid enum value fails, missing repository on sovereign type fails

**SRS reference:** 3.8 Manifest System, Section 5 Plugin Manifest Reference

**Review checklist:**
- All fields from SRS Section 5 present in the TypeScript interface
- `shell`, `database`, `runtime`, `type` fields all typed correctly with correct enum values
- Validation tests pass

---

### Task 0.3.05 — `packages/mailer` — SMTP abstraction

**Goal:** Thin mailer package wrapping nodemailer with a simple `send()` interface.

**Deliverables:**
- `packages/mailer/` with:
  - `src/mailer.ts` — `createMailer(config)` factory, `send(options: MailOptions)` method
  - `src/types.ts` — `MailOptions`, `MailerConfig` interfaces
  - `src/index.ts` — barrel export
- Config reads from env: `SMTP_HOST`, `SMTP_PORT`, `SMTP_USER`, `SMTP_PASS`, `SMTP_FROM`
- Graceful no-op when SMTP is not configured (logs warning, does not throw)

**SRS reference:** NFR-02 (email optional), SDK surface `sdk.mailer.send()`

**Review checklist:**
- `send()` accepts `to`, `subject`, `html`, `text`
- No-op behaviour when SMTP unconfigured — does not crash the runtime
- No hardcoded credentials anywhere

---

### Task 0.3.06 — `packages/ui` — component library scaffold

**Goal:** Shared UI package scaffold. No components yet — just the package structure, design token foundation, and one primitive component to validate the setup.

**Deliverables:**
- `packages/ui/` with:
  - Tailwind config extending a base token set (colours, spacing, typography)
  - `src/components/Button.tsx` — single primitive component to validate the setup
  - `src/index.ts` — barrel export
- Builds cleanly and is importable by the runtime

**SRS reference:** 2.2 Tech Stack (`packages/ui`)

**Review checklist:**
- `Button` renders without errors when imported into a test file
- Tailwind tokens are defined, not hardcoded values in components

---

### Task 0.3.07 — `packages/sdk` — interface definitions

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
- ESLint rule configured at root: no imports from `runtime/src` in `plugins/*`

**SRS reference:** 3.6 SDK, NFR-06

**Review checklist:**
- All SDK methods from SRS 3.6 present
- Unimplemented stubs throw `NotImplementedError` with a clear message
- ESLint import boundary rule is active and catches a violation in a test case

---

### Task 0.3.08 — `apps/auth` — better-auth server **[parallel with 0.3.09]**

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
- Uses `packages/db` for user storage

**SRS reference:** 3.3 Auth Layer, 4.3 Functional Requirements — Auth

**Review checklist:**
- Login sets httpOnly cookie
- `/api/verify` returns 401 for invalid/expired token
- First registered user gets `platform:admin`
- `AUTH_INVITE_ONLY=true` blocks registration without valid invite token
- `AUTH_SECRET` has no default value — throws on startup if unset

---

### Task 0.3.09 — Runtime scaffold **[parallel with 0.3.08]**

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
- Environment: `SOVEREIGN_AUTH_URL`, `SOVEREIGN_AUTH_SECRET`

**SRS reference:** 3.4 Runtime Layer, 3.10 Shared Login State, PLT-01, PLT-02, PLT-08

**Review checklist:**
- Unauthenticated request to `/` redirects to `/login`
- Shell renders correctly on desktop and mobile viewports
- `app/plugins/` is gitignored
- No hardcoded auth secret

---

### Task 0.3.10 — Generate script

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
- `turbo.json` updated: `runtime#build` depends on generate script running first
- `package.json` script: `"generate": "tsx scripts/generate-registry.ts"`

**SRS reference:** 3.9 Plugin Loading Model

**Review checklist:**
- Invalid manifest causes script to exit non-zero with a readable error
- `runtime/generated/registry.ts` is valid TypeScript after running
- Symlinks created in dev mode, copies in production mode
- Running generate with no plugins produces an empty registry without errors

---

### Task 0.3.11 — Docker Compose for local dev

**Goal:** Docker Compose setup orchestrating runtime and auth server for local development.

**Deliverables:**
- `docker-compose.yml` — services: `runtime` (port 3000), `auth` (port 3001)
- `docker-compose.prod.yml` — production overrides
- `.env.example` at repo root with all required env vars documented
- `docs/self-hosting.md` — getting started guide: clone, configure env, `docker compose up`

**SRS reference:** NFR-01, 2.4 Phased Roadmap v0.3

**Review checklist:**
- `docker compose up` starts both services without errors
- Runtime is reachable at `localhost:3000`
- Auth server is reachable at `localhost:3001`
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
      { "id": "com.sovereign.tasks", "repository": "https://github.com/CommonsEngine/sovereign-plugin-tasks" },
      { "id": "com.sovereign.splitify", "repository": "https://github.com/CommonsEngine/sovereign-plugin-splitify" }
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

**Goal:** Single production Docker image for the runtime. Auth server gets its own image.

**Deliverables:**
- `Dockerfile` (runtime) — multi-stage: deps → build → production
- `apps/auth/Dockerfile` — multi-stage for auth server
- `docker-compose.prod.yml` updated to use built images
- Images build cleanly and pass a smoke test (login flow works end-to-end)

**SRS reference:** NFR-01, 2.4 Phased Roadmap v0.5

**Review checklist:**
- Images build without errors
- Combined image size is reasonable (< 500MB)
- Login → session cookie → authenticated request works end-to-end in production image
- No dev dependencies in production image

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
- `bin/sv` entry point
- Commands:
  - `sv install` — runs install script, clones sovereign/community plugins defined in config
  - `sv generate` — runs generate script
  - `sv build` — runs generate then pnpm build
  - `sv dev` — starts runtime and auth server in dev mode
  - `sv serve` — starts production server via direct node. PM2 is supported as an optional non-Docker deployment path — documented in `docs/self-hosting.md` but not the canonical production approach. Docker is canonical.
  - `sv plugin add <repository>` — clones a plugin, runs generate
  - `sv plugin remove <id>` — removes plugin directory, runs generate

**SRS reference:** 2.4 Phased Roadmap v0.5

**Review checklist:**
- `sv dev` starts both services correctly
- `sv plugin add` clones and wires a plugin end-to-end
- `sv plugin remove` cleans up symlinks/copies and updates registry
- CLI help text is accurate

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

**Goal:** GitHub Actions CI pipeline covering lint, typecheck, build, and generate validation.

**Deliverables:**
- `.github/workflows/ci.yml` with jobs:
  - `lint` — runs ESLint across all packages including import boundary rule (NFR-06)
  - `typecheck` — runs `tsc --noEmit` across all packages
  - `generate-validate` — runs `pnpm generate --mode=prod` and verifies `runtime/generated/registry.ts` is valid TypeScript
  - `build` — runs `turbo build` in production mode
- CI triggers on: push to `main`, all pull requests
- All jobs use pnpm cache for speed

**SRS reference:** SRS 3.9 (CI validation step), PLT-07, NFR-06

**Review checklist:**
- All four jobs pass on a clean checkout
- Import boundary violation in a plugin causes `lint` job to fail
- Invalid manifest in `plugins/` causes `generate-validate` job to fail
- pnpm cache is correctly restored between runs

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

*Version 0.2 — June 2026. Updated to address review findings: middleware contradiction resolved, SDK split clarified, install-plugins and CI tasks added, PM2 scoped, parallel tasks tagged. Task breakdown covers platform only. Plugin-specific task breakdowns (Tasks, Splitify) are maintained in their respective repositories.*
