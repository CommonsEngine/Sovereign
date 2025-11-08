# RFC-0005: SQLite View-Only Schema for Plugin Read Access

**Status:** Draft  
**Author:** Sovereign Team, Codex (AI assistant)
**Created:** 2025-11-08  
**Target Version:** Sovereign v0.2  
**Tags:** Security, SQLite, Prisma, Read-Only

---

## 1. Problem Statement

Some plugins need to read slices of core data (users, boards, configs) but should never mutate them. SQLite lacks GRANT/REVOKE, so a single database file still allows writes to any table. We can expose curated read-only views and restrict the Prisma schema used by plugins so no write queries are generated.

## 2. Goals

- Allow plugins to query only approved tables/columns needed for their features.
- Prevent accidental writes to core tables from plugin contexts.
- Remain compatible with the existing single SQLite file for simple deployments.
- Require minimal operational overhead compared to dual-database solutions.

## 3. Non-Goals

- Providing write paths for plugins (combine with RFC-0004 or RFC-0006 if writes are required).
- Solving per-tenant isolation; this RFC focuses on table/column scope.

## 4. Proposal

### 4.1 Create Read-Only Views

1. Define SQL views that project only the columns safe for plugins, e.g.:
   ```sql
   CREATE VIEW v_plugin_users AS
   SELECT id, display_name, avatar_url, tenant_id
   FROM users;
   ```
2. Prefix all plugin-visible views with `v_plugin_*` for discoverability.

### 4.2 Restrict Prisma Schema

- Generate a dedicated Prisma schema for plugins that **only** declares the views and plugin-owned tables:

  ```prisma
  model PluginUser {
    id          String @id @map("id")
    displayName String @map("display_name")
    tenantId    String @map("tenant_id")

    @@map("v_plugin_users")
    @@ignoreRead(false)
    @@ignoreWrite(true)
  }
  ```

- Because Prisma does not generate write helpers for views, plugins cannot call `create/update/delete` on these models.

### 4.3 Extension Host Changes

- Instantiate the plugin Prisma Client from the restricted schema file (e.g., `prisma/plugin-views.prisma`).
- During plugin registration, only pass this limited client.
- Validate at runtime that attempts to access undeclared models throw early (e.g., guard `context.db` properties).

### 4.4 Operational Tooling

- Add a migration helper (`sv migrate:views`) that re-creates the views whenever the underlying tables change.
- Document the mapping between core tables and plugin views.

## 5. Rollout Plan

1. Author SQL migrations to create required `v_plugin_*` views.
2. Scaffold the plugin Prisma schema referencing those views.
3. Update plugin code to use the new client (mostly type import changes).
4. Remove access to the full-core client from plugin sandboxes.

## 6. Security Impact

- **Confidentiality:** Sensitive columns never surface in the views, limiting data exposure.
- **Integrity:** Plugins cannot mutate core tables because they only see views and plugin-owned tables.
- **Auditability:** Any attempt to reach non-whitelisted data fails during client code generation.

## 7. Risks & Mitigations

- **Schema Drift:** Views can become invalid after schema changes; add CI checks that `prisma migrate deploy` validates both schemas.
- **Performance:** Complex views might impact read latency. Consider materialized snapshots or caching if needed.
- **Developer Ergonomics:** Plugin authors must understand the subset of data available. Provide documentation and TypeScript types generated from the schema.

## 8. Alternatives

- Separate SQLite files with synchronization (RFC-0004).
- API broker pattern (RFC-0006) for read/write mediation.

## 9. Open Questions

1. Should plugins be allowed to define their own views, or are views centrally managed by the core team?
2. How do we version view-breaking changes so plugin authors can adapt gracefully?
3. Can we auto-generate views from plugin capability declarations in the future?
