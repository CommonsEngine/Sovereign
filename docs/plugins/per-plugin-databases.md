# Per-Plugin Database Support

This document captures the strategy for giving Sovereign plugins the option to run against their own database instead of the shared plugin datasource. It complements RFC-0003..0006 and focuses on the developer/operational workflow we will implement inside the platform.

## Goals

- Let a plugin (e.g., Papertrail) request an isolated datasource without forcing every plugin to incur the overhead.
- Keep Prisma ergonomics by generating a client that is pre-wired to the plugin’s database.
- Centralize lifecycle management (provision, migrate, rotate credentials, teardown) in the platform so plugins remain sandboxed.
- Provide a paved path for both SQLite (local/dev) and PostgreSQL/MySQL (production) deployments.

> **Note:** The initial implementation only supports SQLite (`exclusive-sqlite` mode). Other providers remain on the roadmap and are called out here for context, but they are not yet wired up at runtime.

## High-Level Architecture

```
┌──────────┐      manifest.sovereign.database      ┌────────────────────┐
│ Plugin   │ ───────────────────────────────────▶ │ Plugin DB Manager  │
│ manifest │                                       │ (extension host)   │
└──────────┘                                       ├────────────────────┤
                                                   │ provider drivers   │
                                                   │  • SQLite files    │
                                                   │  • Postgres roles  │
                                                   │  • MySQL schemas   │
                                                   └────────┬───────────┘
                                                            │
                                         ┌──────────────────┴────────────────┐
                                         │ Prisma client generation + inject │
                                         └───────────────────────────────────┘
```

1. Plugins declare their desired database mode in `plugin.json` (see Manifest Contract).
2. During install/enable, the **Plugin Database Manager** provisions or reuses the datasource via the requested provider.
3. The platform generates or loads the plugin-specific Prisma Client and injects it into the sandboxed runtime (`context.db`).
4. Core data access still flows through the broker (RFC-0006); the isolated DB only stores plugin-owned tables.

## Manifest Contract

`plugin.json → sovereign.database` becomes the single source of truth:

```jsonc
"sovereign": {
  "schemaVersion": 2,
  "...": "...",
  "database": {
    "mode": "exclusive-postgres",
    "provider": "postgresql",
    "schema": "papertrail",
    "migrations": {
      "directory": "migrations",
      "entryPoint": "scripts/migrate.js"
    },
    "limits": {
      "storageMb": 1024,
      "connections": 5
    }
  }
}
```

Modes:

| Mode                 | Description                                                                                                            |
| -------------------- | ---------------------------------------------------------------------------------------------------------------------- |
| `shared`             | Plugin uses the existing shared datasource (default / backwards-compatible).                                           |
| `exclusive-sqlite`   | Manager creates `data/plugins/<pluginId>.db` and wires a dedicated SQLite Prisma datasource.                           |
| `exclusive-postgres` | Manager provisions a schema/role pair in the primary Postgres cluster and hands the credentials to the plugin runtime. |

Additional providers (e.g., MySQL) plug in via the same interface when needed.

## Plugin Database Manager

- New service under `platform/src/services/plugin-database-manager.js`.
- Responsibilities:
  - Parse `sovereign.database`.
  - Provision/destroy datasources via provider drivers.
  - Run migrations via the plugin-specified entry point (or a default `prisma migrate deploy` helper).
  - Produce a `PluginDatasourceDescriptor` (`{ url, provider, manifest, secretsRef }`) that the extension host uses when constructing plugin sandboxes.
  - Emit structured audit logs for every lifecycle event.
- Providers planned for v1:
  1. **SQLiteFileProvider** – ensures directory structure, creates file, returns `file:...` URL.
  2. **PostgresRoleProvider** – uses RFC-0003 patterns to create roles/schemas, rotate passwords, and grant least privilege.

## Prisma Integration

- Each plugin that opts in ships a Prisma schema template (generated during `sv plugin build`) with placeholders for the datasource URL.
- The extension host injects `PLUGIN_DATABASE_URL` (per plugin) before dynamic importing the plugin bundle to ensure Prisma lazily connects to the right database.
- Shared fallback (`mode = "shared"`) keeps using the existing plugin Prisma client, so legacy plugins remain untouched.

## CLI & Automation

**Available today**

- `sv plugins create <ns> --db exclusive` scaffolds the manifest with `exclusive-sqlite` mode enabled.
- `sv plugins db ensure <namespace>` provisions (or reuses) the plugin’s SQLite file and prints its path.
- `sv plugins db info <namespace>` inspects the current descriptor (mode/provider/url) for a plugin.

**Planned additions**

- `sv plugin db migrate <pluginId>` invokes the manager to run migrations locally or in CI.
- `sv doctor plugins --db` reports the health/size of every plugin datasource and flags drift (e.g., missing migrations, stale schema).

## Rollout Plan

1. **Schema + typings:** introduce `sovereign.database` in the manifest schema, TypeScript defs, and validation tooling (this change).
2. **Manager skeleton:** land the service with provider hooks and stub methods so other teams can start integrating.
3. **SQLite provider pilot:** support local dev + CI; point Papertrail to its exclusive DB for end-to-end testing.
4. **Postgres provider:** wire into production stacks, complete credential rotation + auditing.
5. **Plugin migrations + CLI:** ensure plugin authors have a paved path for maintaining their schemas.
6. **Full enforcement:** once a plugin declares exclusive mode, automatically withhold the shared Prisma client from its sandbox.

This document will evolve as we add provider-specific guides and CLI references. For now it provides the shared vocabulary and entry points for engineers starting the implementation work.
