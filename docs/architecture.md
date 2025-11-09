# Sovereign Architecture Overview

Sovereign is a privacy-first collaboration platform that gives communities and organizations full sovereignty over their data, workflows, and extensibility. The stack combines a lean core runtime with a plugin system so features can evolve independently while sharing authentication, storage, and deployment tooling.

## Problem Space and Value Proposition

- **Centralization fatigue**: Teams rely on SaaS silos that monetize their data and dictate roadmaps. Sovereign keeps the control plane self-hostable and auditable.
- **Fragmented collaboration tooling**: Chat, docs, publishing, billing, and analytics typically live in separate products. Sovereign’s plugin architecture lets these domains coexist behind one login and RBAC model.
- **Extensibility for humans and AI agents**: Plugins describe routes, capabilities, and assets declaratively, making it straightforward for other automation systems (or future AI copilots) to discover functionality.

## High-Level System

```
┌────────────────────────────────────────────────────────────────────┐
│  Client (SPA, SSR, CLI)                                            │
└───────────────▲───────────────────────┬─────────────────────────────┘
                │ HTTP/WebSocket        │ CLI RPC
        ┌───────┴───────────────────────▼──────────────────────────┐
        │        Platform Core (Express runtime)                  │
        │  bootstrap ▸ config ▸ middlewares ▸ routes ▸ views      │
        │  RBAC ▸ settings ▸ logging ▸ shared services            │
        └───────▲───────────────────────┬──────────────────────────┘
                │ Extension Host        │ Prisma/Data
        ┌───────┴────────────┐   ┌──────▼──────────────────────────┐
        │ Plugin Contracts    │   │ SQLite / PostgreSQL via Prisma │
        │ (routes, assets,    │   │ + optional plugin extensions   │
        │ lifecycle hooks)    │   └────────────────────────────────┘
        └─────────────────────┘
```

## Core Platform (`platform/`)

1. **Bootstrap & config**: `platform/src/bootstrap.js` wires environment config, `.env`, and manifest discovery before starting the HTTP server in `platform/src/server.js`.
2. **Express runtime**: Common middleware (sessions, CSRF, logging) live under `platform/src/middlewares/`. Routes in `platform/src/routes/` register both the built-in UI and plugin-provided routers.
3. **Views & rendering**: Handlebars templates in `platform/src/views/` serve baseline pages, while React-style JSX can be rendered through the same pipeline when required.
4. **Services & libs**: Shared abstractions for storage, messaging, RBAC, and job orchestration reside in `platform/src/services/` and `platform/src/libs/`, keeping plugins thin.
5. **WebSocket & realtime**: `platform/src/ws/` (plus helpers in `platform/src/utils/`) hosts websocket gateways for collaborative experiences.

## Data & Persistence

- **Layered Prisma schemas**: `platform/prisma/base.prisma` defines canonical tables, each plugin contributes to `plugins/<ns>/prisma/extension.prisma`, and the build step composes them into `platform/prisma/schema.prisma`.
- **SQLite-first with upgrade path**: Local deployments default to SQLite for minimal friction. Because Prisma is the boundary, migrating to PostgreSQL (or other SQL backends) only updates datasource configuration.
- **No manual schema edits**: Developers run `yarn prisma:compose` (root or via workspace) whenever models change; CI enforces the generated schema to avoid drift.

## Plugin Runtime (`plugins/<namespace>/`)

- **Manifest-driven**: Every plugin ships a `plugin.json` describing ID, engine compatibility, type (`spa` or `custom`), entry file, exposed routes, capabilities, and optional dev-server metadata.
- **Lifecycle hooks**: Entry modules export `render`, `configure`, and `getRoutes` today, with planned `onInstall/onEnable` hooks for seeding data or migrations.
- **Asset strategy**: Static assets under `public/` are copied verbatim. Code under `src/` or `routes/` is transpiled but keeps file extensions so dynamic imports remain stable.
- **Development ergonomics**: SPA plugins can declare a Vite dev server so the platform proxies HMR traffic automatically when `NODE_ENV !== "production"`.

### Module vs. Project Plugins

- **Module plugins** (`allowMultipleInstances` omitted/false) behave like global features. They mount once (e.g., `/blog`) and store configuration at the workspace level. They are ideal for dashboard-style utilities or single-instance tools.
- **Project plugins** (`sovereign.allowMultipleInstances: true`) support many instances per tenant/project. Routes automatically include project identifiers (e.g., `/blog/:id`) and the runtime expects per-project settings plus RBAC scoping.
- The kind is inferred at runtime (`pluginKind = allowMultipleInstances ? "project" : "module"` in `platform/src/ext-host/build-routes.js`). This influences route wiring: SPA project plugins mount `/namespace/:id` while module variants mount `/namespace`.
- Manifests may also set `featureAccess.roles` to further restrict who can load module/project routes; the platform applies those guards uniformly when wiring routers.

## Styling System

- **Design tokens first**: `platform/src/public/css/sv_base.css` defines colors, spacing, typography, radii, and elevation tokens under CSS custom properties. Every UI element extends those tokens, so plugins can opt into the same visual DNA without pulling in a component library.
- **Layered cascade**: The file uses `@layer platform.base` to scope resets, typography defaults, and primitive components (buttons, inputs, stacks) so plugin styles can safely add their own layers without having to fight specificity wars.
- **Theming**: Switching to dark mode simply toggles `data-theme="dark"` on `:root`, which overrides the token set. Because components reference tokens rather than literal colors, themes propagate automatically.
- **Utility-friendly**: The base CSS intentionally mirrors Tailwind-like naming (`--space-s`, `--radius-m`) so design systems or utility classes generated later can reuse the same scales.

## Routing Model

- **Core routes**: `platform/src/routes/` hosts first-party HTTP endpoints (home, auth, admin). Each route module is an Express router wired with platform middlewares such as `requireAuth`, `requireRole`, and `exposeGlobals`.
- **Plugin router builder**: `platform/src/ext-host/build-routes.js` walks the generated `manifest.json`, resolves each plugin’s entry points, and mounts them:
  - SPA plugins get `/namespace` view routes plus `/api/plugins/namespace` APIs if they expose an API entry.
  - Custom plugins can expose both `web` and `api` routers; the builder applies auth/layout middlewares and mounts them at `/namespace` and `/api/plugins/namespace`.
- **Context injection**: Before mounting, the builder resolves a plugin context (cacheable per namespace) that contains the env, logger, and granted platform capabilities. Router factories can consume that context to reach Prisma, file helpers, etc.
- **Auth layering**: Every plugin route automatically receives `requireAuth` and any `featureAccess.roles` guard plus `exposeGlobals`, ensuring consistent user/session state without per-plugin boilerplate.

## Capability Model

- **Platform capabilities**: The registry in `platform/src/ext-host/capabilities.js` defines what sensitive services the core exposes (Prisma, Git, FS, mailer, env refresh). Plugins list the capabilities they need under `sovereign.platformCapabilities`; the runtime validates requests, enforces prod-only flags, and injects handles (e.g., `prisma`, `mailer`) into the plugin context.
- **User capabilities**: Authenticated users carry a capability map on `req.user.capabilities`. Helpers in `platform/src/ext-host/plugin-auth.js` expose `assertUserCapability` plus `requireAuthz` so routers can enforce per-action consent levels (allow, consent, compliance, scoped, anonymized, deny).
- **Guard rails**: If a plugin tries to call a service it didn’t declare, `assertPlatformCapability` throws immediately. This keeps plugin boundaries explicit and lets future security tooling audit exactly which plugins can touch what.
- **Role bridge**: `requireAuthz` internally wraps `requireRole`, allowing plugins to gate routes with classic roles (`admin`) or synthetic `cap:<key>` markers, unifying RBAC with the newer capability graph.

| Key          | Provides          | Description                                    | Risk     | Notes                                                           |
| ------------ | ----------------- | ---------------------------------------------- | -------- | --------------------------------------------------------------- |
| `database`   | `prisma`          | Full read/write Prisma client                  | critical | Primary data plane; declare sparingly                           |
| `git`        | `git`             | Git registry helpers for content sync          | high     | Access to repo-backed content stores                            |
| `fs`         | `fm`              | File-system helper scoped to plugin storage    | high     | Limited to plugin sandbox                                       |
| `env`        | `refreshEnvCache` | Allows refreshing cached environment variables | medium   | Useful for applying runtime config changes                      |
| `uuid`       | `uuid`            | Deterministic UUID helpers                     | low      | Pure utility, safe in most contexts                             |
| `mailer`     | `mailer`          | Transactional email client                     | high     | Sends outbound email; respect compliance needs                  |
| `fileUpload` | `fileUpload`      | Temporary upload helper (WIP)                  | medium   | Disabled in prod unless `CAPABILITY_FILE_UPLOAD_ENABLED` is set |

## Tooling and Automation

- **Sovereign CLI (`sv`)**: Manages dev workflows, scaffolds plugins (`sv plugins create`), and rebuilds manifests. Documentation lives under `docs/CLI.md`.
- **Build pipeline**: `tools/build-manifest.mjs` and `platform/src/ext-host/build-routes.js` keep runtime manifests and route registries in sync.
- **Manifest + asset generation**: `manifest.json` in the repo root reflects enablement state, versions, and capabilities that the platform consumes at boot.

## Repository Organization

- `platform/` – core runtime, Prisma schema, HTTP server, shared services, public CSS/JS, and boot scripts.
- `plugins/` – feature modules (Blog, Settings, Users, PaperTrail, Splitify) with their own package.json, manifests, and optional Prisma extensions.
- `packages/` – reusable TypeScript/JS packages (shared types, UI systems) published as workspaces.
- `tools/` – build utilities, manifest composers, and plugin scaffolding templates.
- `docs/` – reference material (CLI usage, plugin UI guidelines, and this architecture overview).
- `tests/` – integration and regression suites (Jest/Vitest per package) to guard critical flows.

## Operational Posture

- **Deployment**: Dockerfile + Caddyfile provide a simple path to containerized deploys. PM2 (`ecosystem.config.cjs`) can manage long-running processes.
- **Configuration**: Environment variables (managed via config helpers) toggle DB backends, plugin drafts, and dev tooling.
- **Future-facing**: RBAC graph merges, lifecycle hooks, and AI-facing metadata are already modeled in manifests, making it simple for other agents to query what the platform can do.

Use this document as the on-ramp for contributors, integrators, or AI systems that need quick situational awareness before diving into specific features.
