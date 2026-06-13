/**
 * Interim DDL bootstrap for platform tables, applied with
 * CREATE TABLE IF NOT EXISTS by `getPlatformDb()` at startup. Replaced by
 * drizzle-kit migrations in Task 0.5.03.
 *
 * Must stay in sync with ./schema/sqlite/platform.ts — the Drizzle schema is
 * the source of truth for shape; this DDL only exists because migrations are
 * not wired yet. Statements are pure DDL (no seeding) so they stay
 * dialect-portable; seed rows are inserted via Drizzle in platform-db.ts with
 * caller-supplied timestamps.
 */

export const TENANTS_BOOTSTRAP_SQL = `
  CREATE TABLE IF NOT EXISTS tenants (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    created_at INTEGER NOT NULL,
    updated_at INTEGER NOT NULL
  )
`;

export const PLUGIN_STATUS_BOOTSTRAP_SQL = `
  CREATE TABLE IF NOT EXISTS plugin_status (
    plugin_id TEXT PRIMARY KEY,
    tenant_id TEXT NOT NULL,
    enabled INTEGER NOT NULL DEFAULT 1,
    updated_at INTEGER NOT NULL
  )
`;

export const PLATFORM_SETTINGS_BOOTSTRAP_SQL = `
  CREATE TABLE IF NOT EXISTS platform_settings (
    key TEXT NOT NULL,
    tenant_id TEXT NOT NULL,
    value TEXT NOT NULL,
    updated_at INTEGER NOT NULL,
    PRIMARY KEY (key, tenant_id)
  )
`;

/** All platform DDL statements, in dependency order. */
export const PLATFORM_BOOTSTRAP_SQL: readonly string[] = [
  TENANTS_BOOTSTRAP_SQL,
  PLUGIN_STATUS_BOOTSTRAP_SQL,
  PLATFORM_SETTINGS_BOOTSTRAP_SQL,
];
