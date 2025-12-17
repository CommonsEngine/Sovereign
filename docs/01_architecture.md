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

## Bootstrap Flow & Initialization

The platform startup follows a strict sequence to ensure services are available before routes are mounted:

1. **`bootstrap.js` entry**: Loads `manifest.json` from root, sets up global error handlers (`unhandledRejection`, `uncaughtException`), and attaches logger to `global.sovereign.logger`.
2. **Database connection**: `connectPrismaWithRetry()` establishes Prisma connection with exponential backoff, ensuring DB is ready before proceeding.
3. **Extension host creation**: `createExtHost(manifest, { pluginsDir })` discovers enabled plugins, validates manifests, and prepares plugin contexts with capability injection.
4. **Server initialization**: `createServer(extHost)` configures Express app, mounts middleware stack, registers core routes, and dynamically mounts plugin routes via `buildPluginRoutes()`.
5. **Server start**: Binds to configured port, initializes WebSocket server, starts background jobs (guest user cleanup), and logs active handles for debugging.
6. **Graceful shutdown**: Registers `SIGINT`/`SIGTERM` handlers that call `gracefulShutdown()` to close DB connections, stop HTTP server, and clean up resources.

**Key implementation notes:**

- Manifest is read synchronously at boot; changes require restart or manifest rebuild.
- Plugin contexts are cached per namespace to avoid redundant capability resolution.
- Active handle tracking (`process._getActiveHandles()`) helps diagnose resource leaks in development.

## Authentication & Session Management

Sovereign uses **cookie-based sessions** backed by the database for stateful authentication:

- **Session storage**: Sessions are persisted in the `Session` table via Prisma, with `sessionToken`, `userId`, and `expiresAt` fields. The platform uses `express-session` (or equivalent) with a Prisma session store adapter.
- **Authentication methods**:
  - **Password + Email**: Traditional username/password flow with bcrypt hashing.
  - **Passkeys (WebAuthn)**: FIDO2-compliant passwordless authentication via `platform/src/services/passkeys.js`. Credentials stored in `PasskeyCredential` table.
  - **TOTP (Time-based OTP)**: Two-factor authentication via `platform/src/services/totp.js`. Secrets stored in user records, challenges tracked in database.
- **Guest users**: Temporary accounts created for unauthenticated access (e.g., demos, trials). A background job (`cleanupExpiredGuestUsers`) runs periodically to purge expired guests based on `GUEST_RETENTION_MS` (default: 24 hours).
- **Session lifecycle**:
  - Sessions are created on successful login and attached to `req.session`.
  - `requireAuth` middleware (in `platform/src/middlewares/auth.js`) validates session and hydrates `req.user` with user object, roles, and capabilities.
  - Sessions expire based on `expiresAt`; expired sessions are rejected and cleared.
- **Token management**: Password reset tokens (`PasswordResetToken`), email verification tokens (`VerificationToken`), and passkey challenges (`PasskeyChallenge`) are stored in dedicated tables with expiration logic.

**Security considerations:**

- Cookies are `httpOnly`, `secure` (in production), and `sameSite: 'lax'` to prevent XSS/CSRF.
- Session tokens are cryptographically random (via `crypto.randomBytes`).
- Sensitive models (User, Session, etc.) are protected from plugin access via Prisma guards (see Capability Model).

## Plugin Guards & Middleware Chain

Plugin routes are protected by a layered middleware stack that enforces enablement, authentication, and access control:

1. **`pluginEnabledGuard`**: Checks if the plugin is enabled in the manifest. If disabled, returns 404 or redirects to error page.
2. **`requireAuth`**: Validates session and hydrates `req.user`. Redirects to login if unauthenticated.
3. **`userPluginGuard`**: For project-scoped plugins, verifies the user has access to the specific project instance (e.g., via `UserPlugin` table or project membership).
4. **`pluginAccessGuard`**: Enforces role-based access from `featureAccess.roles` in the plugin manifest. Uses `requireRole` or `requireAuthz` to check if user has required roles/capabilities.
5. **`exposeGlobals`**: Injects global variables (user, config, manifest metadata) into `res.locals` for templates and views.

**Middleware ordering:**

- **View routes**: `[pluginEnabledGuard, requireAuth, userPluginGuard?, pluginAccessGuard?, exposeGlobals, ensurePluginLayout]`
- **API routes**: `[pluginEnabledGuard, requireAuth, userPluginGuard?, pluginAccessGuard?]`

**Implementation details:**

- Guards are created dynamically per plugin in `platform/src/ext-host/build-routes.js` via factory functions (`createPluginEnabledGuard`, `createUserPluginGuard`, `createPluginAccessGuard`).
- Guards short-circuit on failure (return 403/404) to prevent unauthorized access.
- Plugin contexts are resolved once and cached, avoiding repeated capability checks.

## WebSocket & Realtime Architecture

The platform provides a **channel-based pub/sub system** for real-time features:

- **Server**: `platform/src/ws/server.js` creates a WebSocket server (via `ws` library) that upgrades HTTP connections on `/ws` endpoint.
- **Authentication**: Clients authenticate via session cookies; the server validates `req.session` before accepting connections.
- **Channels**: Clients subscribe to named channels (e.g., `project:123`, `chat:456`). Messages are broadcast to all subscribers of a channel.
- **Heartbeat**: Server sends ping frames every 30 seconds; clients must respond with pong to maintain connection. Stale connections are terminated.
- **Message handlers**: Plugins can register message handlers via the realtime hub registry (`platform/src/ws/registry.js`). Handlers receive `{ type, payload, userId, channelId }` and can broadcast responses.
- **Broadcasting**: `realtimeHub.broadcast(channelId, message)` sends messages to all connected clients subscribed to the channel.

**Use cases:**

- Collaborative editing (live cursors, document updates)
- Notifications and alerts
- Chat and messaging
- Real-time dashboards

**Security:**

- WebSocket connections inherit session authentication; unauthenticated clients are rejected.
- Channel subscriptions can be gated by plugin-specific logic (e.g., project membership).

## Development Tooling & Hot Module Replacement

In development (`NODE_ENV !== "production"`), the platform integrates **Vite middleware** for fast JSX/TSX rendering and HMR:

- **Vite middleware mode**: `platform/src/server.js` creates a Vite dev server in middleware mode, allowing Express to serve Vite-transformed modules.
- **HMR configuration**: Vite's HMR client is configured to use `sovereign.test` domain and `wss://` protocol for WebSocket connections (compatible with Caddy reverse proxy).
- **JSX/TSX SSR**: The `useJSX` middleware (`platform/src/middlewares/useJSX.js`) intercepts `.jsx`/`.tsx` imports and uses Vite to transform them on-the-fly.
- **Plugin dev servers**: SPA plugins can declare a `devServer` in their manifest (e.g., `{ "url": "http://localhost:5173" }`). The platform proxies requests to the plugin's Vite dev server, enabling HMR for plugin frontends.
- **Allowed hosts**: Vite is configured to accept requests from `sovereign.test`, `localhost`, and `127.0.0.1` to support local development with custom domains.

**Production behavior:**

- Vite is not loaded in production; JSX/TSX files are pre-built and served as static assets.
- Plugin dev servers are ignored; only production builds are served.

## Security Headers & Content Security Policy

The platform enforces security best practices via HTTP headers:

- **Helmet**: Configured in `platform/src/server.js` to set secure defaults (X-DNS-Prefetch-Control, X-Download-Options, etc.).
- **Custom headers** (via `platform/src/middlewares/secure.js`):
  - `X-Content-Type-Options: nosniff` – Prevents MIME sniffing.
  - `X-Frame-Options: SAMEORIGIN` – Prevents clickjacking.
  - `Referrer-Policy: no-referrer-when-downgrade` – Limits referrer leakage.
  - **Content-Security-Policy**: Currently relaxed to allow inline scripts/styles (`'unsafe-inline'`). **TODO**: Implement nonce-based CSP by generating a per-request nonce (`res.locals.cspNonce`) and injecting it into script tags.
- **CSRF protection**: Planned but not yet implemented. Future versions will use CSRF tokens for state-changing requests.

**Production vs. Development:**

- CSP is stricter in production (`IS_PROD` flag).
- Development allows `'unsafe-eval'` for Vite HMR.

## Rate Limiting

The platform includes rate limiting middleware (`platform/src/middlewares/rateLimit.js`) to prevent abuse:

- **Per-route limits**: Different endpoints have different rate limits (e.g., login: 5 req/min, API: 100 req/min).
- **Strategy**: Uses `express-rate-limit` with in-memory or Redis-backed store (configurable).
- **Bypass**: Authenticated admin users may bypass rate limits (configurable).

## Error Handling & Observability

- **Request IDs**: Every request is assigned a unique ID (`req.id = randomUUID()`) and returned in the `x-request-id` header for tracing.
- **Global logger**: `platform/src/services/logger.js` provides structured logging (Winston or Pino). Logger is attached to `global.sovereign.logger` for access in Prisma hooks and background jobs.
- **Error handlers**: Unhandled promise rejections and uncaught exceptions are logged and optionally reported to error tracking services (Sentry, etc.).
- **Active handle tracking**: In development, the platform logs active Node.js handles (`process._getActiveHandles()`) to help diagnose resource leaks (open sockets, timers, etc.).

## Data & Persistence

- **Layered Prisma schemas**: `platform/prisma/base.prisma` defines canonical tables, each plugin contributes to `plugins/<ns>/prisma/extension.prisma`, and the build step composes them into `platform/prisma/schema.prisma`.
- **SQLite-first with upgrade path**: Local deployments default to SQLite for minimal friction. Because Prisma is the boundary, migrating to PostgreSQL (or other SQL backends) only updates datasource configuration.
- **No manual schema edits**: Developers run `yarn prisma:compose` (root or via workspace) whenever models change; CI enforces the generated schema to avoid drift.
- **Core data models**:
  - **User & Identity**: `User`, `UserProfile`, `UserEmail`, `UserRole`, `UserRoleAssignment`, `UserCapability` – Stores user accounts, profiles, roles, and capability grants.
  - **Authentication**: `Session`, `PasskeyCredential`, `PasskeyChallenge`, `VerificationToken`, `PasswordResetToken` – Manages sessions, WebAuthn credentials, and token-based flows.
  - **Authorization**: `UserRoleCapability` – Maps roles to capabilities for fine-grained access control.
  - **Multi-tenancy**: `Tenant`, `Project`, `UserPlugin` – Supports workspace/project isolation and per-user plugin enablement.
  - **Audit & Compliance**: `AuditLog`, `Invite` – Tracks security events and invitation flows.
- **Sensitive model protection**: Plugins cannot directly access sensitive models (User, Session, etc.) unless explicitly whitelisted via `SENSITIVE_PLUGIN_ALLOWLIST` config. The capability system wraps Prisma clients with guards that throw `PluginCapabilityError` on unauthorized access.

## Plugin Runtime (`plugins/<namespace>/`)

- **Manifest-driven**: Every plugin ships a `plugin.json` describing ID, engine compatibility, framework (`js` or `react`), plugin type (`module` or `project`), entry file, exposed routes, capabilities, and optional dev-server metadata.
- **Lifecycle hooks**: Entry modules export `render`, `configure`, and `getRoutes` today, with planned `onInstall/onEnable` hooks for seeding data or migrations.
- **Asset strategy**: Static assets under `public/` are copied verbatim. Code under `src/` or `routes/` is transpiled but keeps file extensions so dynamic imports remain stable.
- **Development ergonomics**: SPA plugins can declare a Vite dev server so the platform proxies HMR traffic automatically when `NODE_ENV !== "production"`.

### Module vs. Project Plugins

- **Module plugins** (`type: "module"`) behave like global features. They mount once (e.g., `/blog`) and store configuration at the workspace level. They are ideal for dashboard-style utilities or single-instance tools.
- **Project plugins** (`type: "project"`) support many instances per tenant/project. Routes automatically include project identifiers (e.g., `/blog/:id`) and the runtime expects per-project settings plus RBAC scoping.
- The kind is taken directly from the manifest’s `type` field (`pluginKind = plugin.type` in `platform/src/ext-host/build-routes.js`). This influences route wiring: SPA project plugins mount `/namespace/:id` while module variants mount `/namespace`.
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
- **Development mode**: When `DEV_ALLOW_ALL_CAPS=true` and `NODE_ENV !== "production"`, all capabilities are granted to all plugins automatically. This simplifies local development but is disabled in production.
- **Sensitive model allowlist**: Core plugins (e.g., Users, Settings) can be whitelisted via `SENSITIVE_PLUGIN_ALLOWLIST` env var to access sensitive Prisma models. Non-whitelisted plugins receive a Prisma client wrapped with guards that block queries to `User`, `Session`, `PasskeyCredential`, etc.
- **Production-only capabilities**: Some capabilities (e.g., `fileUpload`) are disabled in production unless explicitly enabled via feature flags (e.g., `CAPABILITY_FILE_UPLOAD_ENABLED=true`).

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
- **Configuration**: Environment variables (managed via config helpers) toggle DB backends, plugin enablement flags, and dev tooling.
- **Future-facing**: RBAC graph merges, lifecycle hooks, and AI-facing metadata are already modeled in manifests, making it simple for other agents to query what the platform can do.

Use this document as the on-ramp for contributors, integrators, or AI systems that need quick situational awareness before diving into specific features.
