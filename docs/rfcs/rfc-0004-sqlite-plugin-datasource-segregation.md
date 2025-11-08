# RFC-0004: SQLite Datasource Segregation for Plugins

**Status:** Draft  
**Author:** Sovereign Team, Codex (AI assistant)
**Created:** 2025-11-08  
**Target Version:** Sovereign v0.2  
**Tags:** Security, SQLite, Prisma, Plugins

---

## 1. Problem Statement

Sovereign currently ships with a single SQLite database file that holds both core platform tables and plugin-owned data. Plugins are given a Prisma Client backed by that file, so they can inspect or mutate every table. SQLite lacks role-based access control, so we must enforce isolation at the file level.

## 2. Goals

- Keep the developer-friendly SQLite stack for local and small deployments.
- Prevent plugins from accessing core tables by giving them a different physical database file.
- Minimize code churn by relying on Prisma’s multi-datasource support.
- Provide a migration path to PostgreSQL/MySQL where RFC-0003 applies seamlessly.

## 3. Non-Goals

- Implement row-level filtering or per-tenant partitioning.
- Guarantee consistency across cross-database transactions (eventual consistency is acceptable).

## 4. Proposal

### 4.1 Dual SQLite Files

1. **`data/core.db`** – core platform tables managed exclusively by the kernel.
2. **`data/plugins.db`** – shared plugin datastore containing:
   - Plugin-owned tables (namespaced per plugin).
   - Materialized copies of core data the plugins need (synced via jobs/triggers).

### 4.2 Prisma Configuration

- Extend `prisma/schema.prisma` (or introduce `prisma/plugins.prisma`) with a second datasource:

  ```prisma
  datasource core {
    provider = "sqlite"
    url      = env("DATABASE_URL")
  }

  datasource plugins {
    provider = "sqlite"
    url      = env("PLUGIN_DATABASE_URL")
  }
  ```

- Generate two Prisma Clients:
  - `@sovereign/db-core` (existing) – injected into kernel services only.
  - `@sovereign/db-plugins` – injected into the extension host and passed to plugins.

### 4.3 Data Synchronization

- **Read use cases:** expose core data via lightweight sync jobs (e.g., copy user profile summaries hourly) or use views mounted with the `ATTACH DATABASE` command in read-only mode.
- **Write use cases:** plugins write to `plugins.db` only. The core periodically ingests or reacts to plugin data via events/jobs.

### 4.4 CLI & Dev Experience

- Update the `sv dev` script to ensure both files exist; auto-create `plugins.db` if missing.
- Provide migration commands: `sv migrate:deploy --scope=core|plugins`.
- Document backup/restore steps for the dual-file layout.

## 5. Rollout Plan

1. Introduce `PLUGIN_DATABASE_URL` env var with default `file:data/plugins.db`.
2. Add migrations to create plugin tables in the new file.
3. Modify the extension host to instantiate the plugin Prisma Client.
4. Update existing plugins to depend on the new client (one PR per plugin).
5. Remove direct access to `core.db` from plugin contexts.

## 6. Security Impact

- **Confidentiality:** Plugins can no longer read core tables; only replicated slices exist in `plugins.db`.
- **Integrity:** Core tables are untouched by plugin writes; corruption risk is contained.
- **Availability:** Crash or lock in `plugins.db` does not affect core operations, assuming watchdog restarts the plugin host separately.

## 7. Risks & Mitigations

- **Data Drift:** Copies of core data may fall out of sync. Use deterministic sync jobs and reconciliation tests.
- **Cross-DB Transactions:** Not supported; design plugin flows to be eventually consistent and leverage events for coordination.
- **Operational Complexity:** Two files to backup. Mitigate with updated automation scripts.

## 8. Alternatives

- Use SQLite `ATTACH` with read-only views instead of separate files (see RFC-0005).
- Migrate to a server-grade RDBMS and apply RFC-0003 directly.

## 9. Open Questions

1. Do we need per-plugin SQLite files or is one shared `plugins.db` sufficient?
2. How frequently should the core sync data into `plugins.db` for near-real-time read scenarios?
3. Should the CLI expose tooling to inspect and purge plugin DB bloat?
