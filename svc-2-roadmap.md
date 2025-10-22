# Sovereign v0.x Extension Architecture Roadmap

This plan bridges the current Sovereign codebase with the RFC-driven architecture (kernel + extension host + manifest-centric plugins). Each phase is incremental so we can land work without disrupting existing features.

---

## 0. Baseline Snapshot ✅

- `bootstrap.mjs` already builds the Express server through `createServer()` and hints at `createExtHost()` (commented).
- All features (e.g., PaperTrail, Blog) still live under `src/core/routes`/`handlers`.
- No `/src/plugins` directory yet; the platform is monolithic.
- Prisma schema is shared across everything (single SQLite DB).

Goal: introduce the extension host alongside the current structure, then peel functionality into plugins.

---

## Phase 1 — Plugin Scaffolding (Low-risk foundation) ✅

1. **Directory & Host Skeleton**
   - Create `src/plugins/` with a placeholder (e.g., `papertrail`) and `plugin.json`.
   - Add `src/core/ext-host/` with the host loader, manifest validator, and sandbox stub.
2. **Manifest Schema & Loader**
   - Implement JSON schema validation (Zod/AJV) for plugin manifests.
   - Scan `/src/plugins/*/plugin.json`, parse, and normalize metadata.
3. **Extension Host API**
   - Flesh out `createExtHost()` (or move to `src/core/ext-host/index.mjs`).
   - Responsibilities: discover plugins, validate manifests, import backend entry, expose lifecycle hooks.
4. **Plugin SDK Stub**
   - Pass a minimal context to plugins (`logger`, `config`, `express.Router`, placeholder DB handle).
   - Document the interface (TS definitions or JSDoc).

Deliverable: Host can load manifest metadata, but plugins do not yet contribute routes.

---

## Phase 2 — Lifecycle Glue & Express Integration ✅

1. **Router Mounting**
   - Allow manifests to declare `mount` points (`api`, `web`).
   - Extension host creates sub-routers; `server.mjs` mounts them after native routes.
2. **Lifecycle Hooks**
   - Implement `register`, `onEnable`, `onDisable`, `onShutdown` per plugin (as per RFC-0002).
   - Track plugin state for reload/unload operations.
3. **Config & Logging**
   - Provide plugin-scoped config access (backed by existing config service).
   - Give each plugin a scoped logger (`ctx.log` with plugin name context).
4. **Error Isolation**
   - Wrap plugin handlers to trap errors and keep the host alive.

Result: Plugins can register Express routes and participate in lifecycle events.

---

## Phase 3 — Migrating Existing Features into Plugins

1. **PaperTrail Extraction (Pilot)**
   - Move papertrail routes/handlers/db logic into `src/plugins/papertrail`.
   - Manifest declares REST/web mounts, capabilities, migrations path.
   - Remove papertrail code from core routers once plugin handles it.
2. **Blog Plugin**
   - Repeat for blog functionality to validate multi-plugin loading.
3. **Shared Services**
   - Expose useful helpers (auth, tenancy context) through the plugin SDK.

Key: run dual tests during migration to ensure the new plugin endpoints behave identically before removing legacy code.

---

## Phase 4 — Plugin Data & Migrations

1. **Plugin-specific Prisma Schema**
   - Allow plugins to provide their own Prisma schema/migrations (path via manifest).
   - Maintain a migration registry per plugin (and tenant in future).
2. **Multiple Prisma Clients**
   - Instantiate dedicated Prisma clients per plugin (and eventually per tenant).
   - Expose the correct client via the SDK.
3. **Tenant Context (Future-ready)**
   - Start passing a tenant ID (`tenant-0` default) into plugin hooks to support multi-tenancy later.
   - Provide helpers for tenant-scoped config.

This phase keeps current data in SQLite but lays groundwork for future Postgres/per-tenant DBs.

---

## Phase 5 — CLI & Operational Tooling

1. **`sv` CLI Skeleton**
   - Implement commands: `sv plugins:list`, `sv plugins:enable <name>`, `sv migrate:deploy [--plugin]`.
   - CLI reuses extension host logic without starting HTTP.
2. **Plugin Enable/Disable Registry**
   - Persist plugin enablement state (DB table or config file).
   - Extension host only loads enabled plugins.
3. **Dev Hot Reload (Optional)**
   - Watch plugin directories in development and reload plugin modules automatically.

---

## Phase 6 — Hardening & Production Readiness

1. **Sandbox Execution**
   - Move plugin code into isolated VM contexts or Worker threads.
   - Provide proxy APIs for allowed operations (`fetch`, `fs`, storage).
2. **Signature / Allow-list Validation**
   - Verify plugin manifests via signatures or maintain a trusted allow-list.
3. **Testing & Diagnostics**
   - Add integration tests for the extension host, plugin loading, and migrations.
   - Expose a `/health` or `/diagnostics` endpoint to report plugin status.
4. **Documentation & Examples**
   - Publish SDK and manifest docs.
   - Provide example plugins (PaperTrail, Blog) for reference.

---

## Supporting Tasks (Cross-cutting)

- Populate `server.services` with shared resources (db, config, logger) so the host can pass them cleanly to plugins.
- Update `.env` to include plugin-related configuration (`PLUGINS_DIR`, allow-list, etc.).
- Prepare for the Postgres migration (phase shift after v1).
- Maintain regular backups and health-checks when plugins manage their own schema/data.

---

This roadmap keeps risk low by pairing incremental infrastructure changes with gradual feature migration. Each phase can land as a standalone PR while preserving existing functionality.
