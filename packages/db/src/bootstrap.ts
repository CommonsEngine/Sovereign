/**
 * Interim DDL bootstrap for platform tables, applied with
 * CREATE TABLE IF NOT EXISTS by the runtime at startup. Replaced by
 * drizzle-kit migrations in Task 0.5.03.
 *
 * Must stay in sync with ./schema/sqlite/platform.ts — the Drizzle schema is
 * the source of truth for shape; this DDL only exists because migrations are
 * not wired yet.
 */
export const PLUGIN_STATUS_BOOTSTRAP_SQL = `
  CREATE TABLE IF NOT EXISTS plugin_status (
    plugin_id TEXT PRIMARY KEY,
    tenant_id TEXT NOT NULL,
    enabled INTEGER NOT NULL DEFAULT 1,
    updated_at INTEGER NOT NULL
  )
`;
