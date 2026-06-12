# CLAUDE.md

Guidance for Claude Code working in this repository.

## What this is

**Sovereign** — a modular, self-hostable workspace runtime. A shared platform
(auth, DB, email, UI) hosts installable **plugins** as first-class apps. The
plugin system _is_ the product, not an app extended with plugins. Open source,
privacy-first, single-tenant/multi-user in v1.

## Source of truth

Two documents define everything. Read the relevant sections before any task —
they are authoritative over assumptions:

- `docs/sovereign-proposal-plan-srs.md` — Concept, Plan, Architecture, SRS,
  manifest reference, decision log.
- `docs/sovereign-implementation-tasks.md` — The build plan: ~22 sequenced
  tasks (v0.3 → v0.4 → v0.5 → v1.0). Each task = one branch = one PR.

## Working conventions

- **One task at a time.** Implement a single task, verify its review checklist,
  then stop for human review. Do not start a task on an unmerged PR.
- **Tasks are sequenced** — each depends on the previous unless tagged
  `[parallel]`. Don't skip ahead.
- **Branch per task**, always cut from an **up-to-date `main`** — run
  `git switch main && git pull` first. Name by change type:
  - `feat/<slug>` — features
  - `fix/<slug>` — bug fixes
  - `docs/<slug>` — documentation
  - `chore/<slug>` — tooling, scaffolding, deps, maintenance

  e.g. `feat/shared-tsconfig`, `chore/scaffold-monorepo`.
  _(Post-v1.0.0 this changes: `main` becomes the production branch and `dev`
  the integration branch — branch from `dev` then. Until then, base off `main`.)_

- **Doc task numbers (e.g. `0.3.02`) are for local tracking only.** Never put
  them in branch names, commit messages, or PR titles/descriptions. Refer to the
  work by what it does, not its task number.
- **Commits** end with the trailer (model-agnostic — do not use a specific
  model name, as multiple models may contribute to one task):
  `Co-Authored-By: Claude Code <noreply@anthropic.com>`
- **PRs** target `main`; body ends with the Claude Code attribution line.
  Describe what changed and why, and cite relevant SRS sections — but no task
  numbers.
- **Merge strategy: rebase and merge** (never squash, never create a merge
  commit). Keeps history linear — each task's commit lands on `main` verbatim.
- **Fix commit messages BEFORE merging the PR.** Once a squash-merge lands on
  `main`, correcting it means rewriting/force-pushing `main` — avoid that.
- **Verify before claiming done.** Run the task's review-checklist commands and
  show the output.
- Never merge a PR automatically. Either wait for explicit instruction to merge,
  or ask for consent before doing so.
- **Version bumps** are part of the PR — bump the relevant `package.json`(s)
  in the same branch, following semver tied to the change type:
  - `fix/` → **patch** (0.0.x)
  - `feat/` → **minor** (0.x.0)
  - Breaking change → **major** (x.0.0) — also requires a migration note in
    `docs/upgrade.md`
  - `chore/` / `docs/` → no version bump unless a public API changed

  The **SDK** (`packages/sdk`) and **UI** (`packages/ui`) are under an
  additional constraint per NFR-04: patch releases must never contain breaking
  changes; breaking changes require at minimum a minor bump and a migration
  note, regardless of branch type. Both packages are published to npm as
  `@sovereignfs/sdk` and `@sovereignfs/ui` — they are public contracts for
  plugin developers.

  The **platform version** in the root `package.json` tracks the roadmap
  milestones (v0.3.x → v0.4.x → v0.5.x → v1.0.x). Bump it when a phase
  milestone is reached.

## Code quality

Established in Task 0.3.03. Every package and PR must comply — no exceptions.

### Tools

| Tool                       | Purpose                                                       |
| -------------------------- | ------------------------------------------------------------- |
| **Prettier**               | Formatting — single source of truth for style                 |
| **ESLint 9 (flat config)** | Linting — correctness, best practices, SDK boundary rule      |
| `typescript-eslint`        | TypeScript-specific ESLint rules (recommended + strict)       |
| `eslint-config-prettier`   | Disables ESLint formatting rules that conflict with Prettier  |
| `simple-git-hooks`         | Pre-commit hook runner (lighter than Husky, no shell scripts) |
| `lint-staged`              | Runs Prettier then ESLint only on staged files (fast)         |
| `.editorconfig`            | Editor-level baseline — indent, line endings, charset         |

### Formatting conventions (Prettier)

- Single quotes
- Semicolons
- Trailing commas (`all`)
- Print width: 100
- Tab width: 2 spaces

### Rules

- **Never disable ESLint rules inline** (`// eslint-disable`) without a comment
  explaining why, and never disable the SDK boundary rule.
- **Prefix intentionally-unused identifiers with `_`** (e.g. required-by-signature
  stub params, ignored destructured fields). `no-unused-vars` ignores `^_`; this
  is the only sanctioned way to keep an unused binding.
- **Never add per-package Prettier overrides.** One config, entire monorepo.
- `pnpm format:check` and `pnpm lint` must pass before every PR. The pre-commit
  hook enforces this locally; CI enforces it on every push.
- **No Biome.** ESLint is required for the custom `no-restricted-imports` SDK
  boundary rule. Running both would be redundant overhead.

### Commands

```bash
pnpm format          # write formatting fixes across the whole repo
pnpm format:check    # check formatting without writing (used in CI)
pnpm lint            # run ESLint
pnpm lint:fix        # run ESLint with auto-fix
```

## Hard architectural rules (enforced or load-bearing)

- **SDK is the only plugin↔platform contract.** Plugins MUST NOT import from
  `runtime/src`. ESLint enforces this (established in Task 0.3.03, verified in
  Task 0.3.08). Plugins use `packages/sdk` only.
- **Every package/app extends `packages/tsconfig`** (`base`/`nextjs`/`library`),
  established in Task 0.3.02. Easy to forget on new packages.
- **Manifests are validated at build time.** Invalid manifest = failed build.
- **Plugin tables are slug-prefixed** (`tasks_lists`, `splitify_groups`).
  Single shared schema, no per-plugin DBs in v1.
- **`tenant_id` everywhere** on user-scoped tables from day one (future
  multi-tenancy), even though no multi-tenant logic exists in v1.
- **DB is dialect-agnostic** (Drizzle): SQLite default, Postgres via env only.
  No SQLite-specific SQL in app code.
- **No secrets with defaults.** `AUTH_SECRET` / `SOVEREIGN_AUTH_SECRET` etc.
  must throw on startup if unset.
- **Plugins compose at their `routePrefix` under a `shell`-selected route
  group.** The generate script injects `plugins/[id]/app/` into
  `runtime/app/(platform)/(plugins)/<routePrefix>/` for `shell: default` plugins
  (they inherit the platform sidebar via App Router layout nesting — no
  rewrites). The route segment is the manifest `routePrefix`, not the source
  directory name, so `routePrefix` is the single source of truth for a plugin's
  URL; the `(plugins)` route group is URL-transparent, so `routePrefix: /console`
  serves at `/console`. The composed segments are **copies** (in every
  environment — Next's dev route watcher does not follow symlinked route dirs)
  and are gitignored by a `.gitignore` inside each route group — never edit or
  commit them. Source of truth is always `plugins/[id]/app/`. `shell: minimal` (a
  chrome-free group) is not wired yet; the generate script fails loudly on it.
- **`adminOnly` routes are gated in the runtime middleware.** A request under an
  admin-only plugin's `routePrefix` from a non-`platform:admin` user returns 403
  (SRS §3.4, PLT-03).

## Design system (`packages/ui`)

`packages/ui` is the **Sovereign Design System** — a public contract for plugin
developers, versioned with the same discipline as the SDK. Breaking a token name
or component API breaks every third-party plugin that uses it.

### Technology

- **Tokens:** CSS custom properties in plain `.css` files — universally
  consumable from any CSS, framework-agnostic, RSC-safe. No JS import required
  to use tokens.
- **Components:** React + CSS Modules — zero extra dependencies, built into
  Next.js, familiar, RSC-safe by default.
- **No Tailwind.** No runtime CSS-in-JS. No third-party component framework.

### Token architecture — two tiers

```
Primitive tokens     raw scale, no semantic meaning
  --sv-grey-50 … --sv-grey-950
  --sv-space-1 … --sv-space-16
  --sv-font-size-sm … --sv-font-size-2xl
  --sv-radius-sm / -md / -lg
        │
        ▼  mapped by semantic layer
Semantic tokens      contextual meaning, what plugin devs use
  --sv-color-surface
  --sv-color-text-primary
  --sv-shadow-card
  --sv-radius-md
```

Plugin developers reference **semantic colour tokens** — never primitive
colours directly. The semantic colour layer is the theming surface that tenant
theming (CON-08) and dark mode override at `:root` / `[data-theme]`; primitives
stay fixed. The scale tokens (`--sv-space-*`, `--sv-radius-*`,
`--sv-font-size-*`) have no separate semantic tier — they are theme-stable and
used directly. See `docs/design-system.md` for the full model. The v1 identity
is **monochrome** (accent = near-black on light, near-white on dark); a tenant
adds colour by overriding `--sv-color-accent`.

### Token prefix

All tokens use `--sv-*` — short, consistent with the `sv` CLI identity, and
unambiguous. **Never abbreviate after the prefix** — use full descriptive names:
`--sv-color-text-primary` not `--sv-ctp`.

### What plugin developers consume

```ts
// Components — typed React components
import { Button, Card, Input, Badge } from '@sovereignfs/ui';

// Tokens — already injected globally by the runtime shell.
// Reference directly in plugin CSS without any import:
// color: var(--sv-color-text-primary);
// background: var(--sv-color-surface);
```

### Scope rules

- The runtime shell and Console plugin use both tokens and components.
- Plugin developers may use any component or token.
- Components must never hardcode values — always reference `--sv-*` tokens.
- Dark mode and tenant theming work by swapping semantic token values at `:root`;
  no component changes required.

## Native mobile app (post-v1 plan)

Mobile is out of scope for v1 but the approach is decided — do not treat it as
an open question or suggest alternatives.

**Model:** Universal Capacitor shell app — one binary on the App Store / Play
Store. On first launch the user enters their self-hosted instance URL. The app
loads it in a WebView. All Sovereign functionality is served by the user's
instance and runs unchanged. Multiple instances supported. Same pattern as
Nextcloud, Bitwarden, Element (Matrix).

**Shell:** Capacitor (single TypeScript codebase for iOS + Android). Lives in a
separate `sovereign-mobile` repository, not this monorepo.

**Device API tiers — in priority order:**

1. **Web APIs** — `navigator.geolocation`, `getUserMedia` etc. Work natively in
   WebViews, also work in browser/PWA. Use these first.
2. **Capacitor plugins** — for what Web APIs can't cover: native photo picker,
   APNs/FCM push notifications, Face ID / fingerprint, haptics, background
   location.
3. **`sdk.device.*`** — the SDK abstraction plugin developers call. Detects
   environment, routes to the correct tier. Plugins never call Web APIs or
   Capacitor directly.

**Plugin developers use `sdk.device.*` only.** This keeps plugins portable
across browser, PWA, and native shell without changes.

See SRS §3.12 for the full specification.

## Tech stack

Next.js 15 (App Router) · TypeScript · Turborepo + pnpm workspaces ·
better-auth (`apps/auth`) · Drizzle ORM (SQLite/Postgres) · nodemailer SMTP
(`packages/mailer`) · CSS Modules + CSS custom properties (`packages/ui`) ·
`tsup` (package bundler, ESM only) · Vitest + Testing Library / jsdom (tests) ·
Zod (manifest
validation) · `citty` + `consola` (`bin/sv` CLI) · `@ducanh2912/next-pwa` ·
Docker Compose.

## Monorepo layout

```
apps/auth/          better-auth wrapper (the only separate Next.js app)
packages/
  tsconfig/         shared TS configs (base/nextjs/library) — extend these
  db/               Drizzle client factory + schema + migration runner
  manifest/         manifest schema, types, validation
  mailer/           SMTP abstraction (no-op when unconfigured)
  ui/               shared component library + design tokens
  sdk/              plugin↔platform contract (types + impls)
runtime/            Sovereign Core (Next.js shell, middleware, registry, SDK bridge)
  generated/        built from manifests — never hand-edit
plugins/console/    core admin plugin (platform type)
plugins/launcher/   home screen plugin (platform type)
plugins/account/    per-user profile plugin (platform type)
scripts/            install-plugins.ts, generate-registry.ts, dev.ts
bin/sv              CLI (v0.5)
```

### Package naming and scope

One owned npm scope for everything: **`@sovereignfs/*`**. The `fs` denotes
_federated systems_ — reflecting the project's long-term federated direction
(federation itself is a post-v1 concern; see SRS §1.4 non-goals).

- `packages/sdk` → `@sovereignfs/sdk` — **published** (plugin contract).
- `packages/ui` → `@sovereignfs/ui` — **published** (design system).
- `packages/db` → `@sovereignfs/db` — internal, `"private": true`.
- `packages/manifest` → `@sovereignfs/manifest` — internal, `"private": true`.
- `packages/mailer` → `@sovereignfs/mailer` — internal, `"private": true`.
- `packages/tsconfig` → `@sovereignfs/tsconfig`. Not published and not imported
  in code; consumed only via TypeScript `extends`
  (`@sovereignfs/tsconfig/base.json` etc.), declared as a `workspace:*`
  devDependency by each consumer.

The "do not publish" signal is `"private": true` in the package's
`package.json` — **not** the scope. A single scope we own avoids the
dependency-confusion risk of aliasing a scope owned by someone else
(`@sovereign` is taken on npm; `@sovereignos`/`-stack`/`-core` collide with
existing products). Only `sdk` and `ui` ever reach npm.

## Commands

```bash
pnpm install            # install workspace deps
pnpm build              # turbo build — packages (tsup) → generate → apps (next build)
pnpm dev                # start dev servers; generate runs automatically on startup
pnpm format             # write Prettier formatting fixes across repo
pnpm format:check       # check formatting without writing (CI)
pnpm lint               # ESLint incl. SDK import-boundary rule
pnpm lint:fix           # ESLint with auto-fix
pnpm typecheck          # tsc --noEmit across packages
pnpm test               # run Vitest across the repo (co-located *.test.ts)
pnpm test:watch         # Vitest in watch mode
pnpm install:plugins    # clone declared sovereign/community plugins (stub until Task 0.5.00)
```

## Dev DX notes

- **No manual rebuilds in dev.** `pnpm dev` starts everything. The runtime's
  dev script is `scripts/dev.ts`: it composes plugins once, then runs the
  generate watcher and the Next.js dev server together (and tears both down on
  exit). HMR handles all subsequent changes.
- **Package changes trigger HMR instantly.** All workspace packages are listed
  in `transpilePackages` in both `runtime/next.config.ts` and
  `apps/auth/next.config.ts`. Next.js compiles package TypeScript source
  directly — no `tsup --watch`, no intermediate `dist/`. Edit
  `packages/ui/src/Button.tsx` and the runtime hot-reloads immediately.
- **Plugin changes trigger HMR via re-copy.** Plugins compose as copies, not
  symlinks (Next's dev route watcher does not discover routes through symlinked
  directories — symlinked plugin routes 404 under `next dev`). `scripts/dev.ts`
  runs the generate script in `--watch` mode, so an edit under `plugins/[id]/app/`
  re-copies into the route group and Next hot-reloads. (This replaced the earlier
  symlink + `resolve.symlinks: false` approach.)
- **tsup is production-only.** tsup runs during `pnpm build` to emit `dist/`
  for Docker images and npm publishing. It is not part of the dev pipeline.
- **Email in dev goes to Mailpit.** The mailer speaks plain SMTP, so dev mail
  capture is config-only (no mock-mode in the package). Run Mailpit via the
  `docker-compose.yml` service or the native binary (both: SMTP `1025`, inbox
  `8025`), point `SMTP_HOST` at it, and read mail at `http://localhost:8025`.
  Email is off by default (SMTP_HOST unset → `send()` no-ops). See
  CONTRIBUTING — "Email in development".
- **Docker Compose runs the full stack locally.** `docker compose up --build`
  starts runtime (`:3000`), auth (internal-only, no host port), and Mailpit.
  The runtime container hardcodes `SOVEREIGN_AUTH_URL=http://auth:3001` (the
  internal service name) — do not set this var in `.env` for Docker use. For
  production use `docker-compose.prod.yml` (standalone file, runtime on `:4000`,
  no Mailpit). See `docs/self-hosting.md`. The `Dockerfile` (runtime) and
  `apps/auth/Dockerfile` are dev-quality; Task 0.5.02 replaces them with
  multi-stage standalone builds.
- **Runtime dev = `scripts/dev.ts`.** The runtime's `dev` script runs the
  orchestrator, which composes plugins (writes the registry, copies plugin
  `app/` trees), then runs the generate watcher + `next dev` on `:3000`. Both
  apps load the single root `.env` via `loadEnvConfig`. The runtime middleware
  verifies each request against the auth server's `/api/verify`
  (`SOVEREIGN_AUTH_URL`) and injects `x-sovereign-user-*` headers;
  `SOVEREIGN_AUTH_SECRET` (local JWT verify) is a v0.5 concern.

## Environment notes

- Node ≥20 (dev on 24.x), pnpm 11.5.2 (pinned via `packageManager`).
- pnpm 11 blocks dependency build scripts by default. `esbuild` (via `tsx`) and
  `better-sqlite3` are allowlisted in `pnpm-workspace.yaml` under `allowBuilds`
  — required for their native bindings. `simple-git-hooks` is set to `false`
  there (the root `prepare` script installs the hooks instead).
- **Shared dev tooling is pinned via the pnpm `catalog:`** in
  `pnpm-workspace.yaml` (`typescript`, `tsup`). Every package references them as
  `"typescript": "catalog:"` / `"tsup": "catalog:"` — never a literal version.
  This stops `pnpm add` from floating one package onto a different major (it
  once pulled TS 6 into a single package). When adding `typescript`/`tsup` to a
  new package, use `catalog:`; to bump the version, edit the catalog once.

## Status

- ✅ Task 0.3.01 — Monorepo scaffold (merged to `main`).
- ✅ Docs — Build, dev DX, deployment, and npm publishing strategy (merged to `main`).
- ✅ Task 0.3.02 — Shared TypeScript config (`packages/tsconfig`) (merged to `main`).
- ✅ Task 0.3.03 — Code quality tooling (ESLint + Prettier + hooks) (merged to `main`).
- ✅ Task 0.3.04 — `packages/db` (Drizzle client factory) (merged to `main`).
- ✅ Task 0.3.05 — `packages/manifest` (schema + validation) (merged to `main`).
- ✅ Chore — pnpm catalog for shared dev tooling (merged to `main`).
- ✅ Task 0.3.06 — `packages/mailer` (SMTP abstraction) (merged to `main`).
- ✅ Task 0.3.07 — `packages/ui` (Sovereign Design System scaffold) (merged to `main`).
- ✅ Task 0.3.08 — `packages/sdk` (interface definitions) (merged to `main`).
- ✅ Chore — manifest `icon` field + plugin specs (Console/Launcher/Account/Tasks/Splitify/Plainwrite) + shell sidebar architecture (merged to `main`).
- ✅ Task 0.3.09 — `apps/auth` (self-contained better-auth server) (merged to `main`).
- ✅ Tasks 0.3.10 + 0.3.11 — Runtime scaffold + generate script (combined) (merged to `main`).
- ✅ Task 0.3.12 — Docker Compose for local dev (merged to `main`).
- ✅ Task 0.4.01 — Console plugin scaffold (plugin route-composition model + middleware admin gating; platform → 0.4.0) (merged to `main`).
- ✅ Task 0.4.02 — Console: user management (user list with invited/active/deactivated status, invite flow, role change, deactivate/reactivate; `sdk.auth` + `sdk.mailer` wired) (merged to `main`).
- ▶️ In review: Task 0.4.03 — Console: plugin management (installed plugin list, enable/disable toggle, middleware 404 for disabled routes; platform DB singleton + `plugin_status` table).
- ⏳ Next: Task 0.4.04 — Console: tenant settings, system health, root plugin config.
- ⏳ Spec complete: Launcher platform plugin (`docs/plugins/launcher.md`) — Task 0.4.05.
- ⏳ Spec complete: Account platform plugin (`docs/plugins/account.md`) — Task 0.4.06.
- ⏳ Spec complete: Shell sidebar three-section architecture (PLT-11–PLT-15, SRS updated).
- ⏳ Spec complete: Plainwrite sovereign plugin (`docs/plugins/plainwrite.md`, v0.2 — provider + SSG adapters).

Keep this file current: update the Status section as tasks complete, and add any
new load-bearing convention that future sessions must not violate.
