# RFC-0003: Dedicated Database Roles for Plugins

**Status:** Draft  
**Author:** Sovereign Team, Codex (AI assistant)  
**Created:** 2025-11-08  
**Target Version:** Sovereign v0.2  
**Tags:** Security, Database, Plugins, Least-Privilege

---

## 1. Problem Statement

Plugins currently receive unrestricted database connections, allowing them to read or mutate every table in the Sovereign schema. This violates least-privilege principles and means a buggy or malicious plugin can exfiltrate secrets, corrupt configuration, or drop core tables. We need an immediate control that limits the blast radius without refactoring the entire data layer.

## 2. Goals

- Provide coarse but enforceable separation between core data and plugin data.
- Require minimal code changes in the plugin host and Prisma layer.
- Enable per-plugin or per-capability auditing of database operations.
- Remain compatible with PostgreSQL/MySQL deployments where role-based access control is available.

## 3. Non-Goals

- Redesigning the plugin SDK or lifecycle.
- Introducing per-row policies or attribute-based access control.
- Supporting SQLite (which lacks native roles); see RFC-0004/0005 for SQLite-specific controls.

## 4. Proposal

### 4.1 Role Model

1. **Core Role (`svc_core`)** – full privileges on the Sovereign schema, used only by the kernel services.
2. **Plugin Service Role (`svc_plugins`)** – read access to a curated subset of tables/views plus optional write access to plugin-owned tables.
3. **Optional Per-Plugin Roles (`svc_plugin_<id>`)** – tailored privileges if a plugin needs unique tables.

### 4.2 Implementation Steps

1. **Create Roles**
   - Example (PostgreSQL):
     ```sql
     CREATE ROLE svc_plugins LOGIN PASSWORD '***';
     REVOKE ALL ON SCHEMA public FROM PUBLIC;
     GRANT USAGE ON SCHEMA public TO svc_plugins;
     GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE plugin_a_data TO svc_plugins;
     ```
   - Repeat for each plugin-owned table set.

2. **Restrict Core Tables**
   - Explicitly revoke access on sensitive tables (`users`, `tenants`, `config`) from `svc_plugins`.
   - Optionally expose sanitized views (read-only) for data plugins may consume.

3. **Update Prisma Configuration**
   - Introduce a second Prisma Client instance configured with the plugin role credentials.
   - Ensure the extension host only injects this restricted client into plugin sandboxes.

4. **Credential Management**
   - Store the plugin role secret in the Sovereign secrets store or environment variables.
   - Rotate credentials on plugin uninstall or periodically.

5. **Telemetry**
   - Tag plugin Client queries with `SET application_name = 'plugin:<id>'` (Postgres) for audit trails.

### 4.3 Operational Flow

- Core services keep using `svc_core`.
- When a plugin registers, the extension host hands it the restricted Prisma Client.
- Any attempt to query unauthorized tables will fail at the database layer, producing a deterministic error surfaced to logs/telemetry.

## 5. Migration & Rollout

1. Create roles and grants via migration scripts or manual DBA operation.
2. Deploy updated configuration with dual Prisma clients.
3. Smoke-test critical plugins to ensure required tables are exposed.
4. Roll out gradually (e.g., staging → canary → production).

## 6. Security Impact

- **Confidentiality:** Prevents plugins from reading user/auth tables.
- **Integrity:** Blocks writes to protected tables; only plugin-owned data is mutable.
- **Auditability:** Database logs now distinguish plugin-originated queries.

## 7. Risks & Mitigations

- **Misconfigured Grants:** Automate grant creation via migrations and add tests that fail CI if unauthorized tables slip in.
- **Operational Overhead:** Document required grants per plugin in its manifest to keep the role map in sync.
- **SQLite Environments:** For local dev on SQLite, fall back to RFC-0004/0005 techniques until a multi-DB stack is available.

## 8. Alternatives

- Application-level ACLs without DB enforcement (insufficient because a compromised plugin can skip our SDK).
- Full row-level security (powerful but higher complexity; can be layered later).

## 9. Open Questions

1. Do we need per-tenant roles when multi-tenancy ships?
2. Should plugin manifests declare their required tables so the CLI can generate grants automatically?
3. How do we surface authorization errors to plugin authors for debug without leaking schema details?
