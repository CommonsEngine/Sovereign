import type { SQL } from 'drizzle-orm';
import type { PlatformDb } from './client';

/**
 * Dialect-aware execution for raw `sql` queries against the platform database.
 *
 * better-sqlite3 is synchronous (`db.get`/`db.all`/`db.run`); node-postgres is
 * asynchronous (`db.execute(...).rows`). These helpers paper over that split so
 * platform queries are written once and run on both dialects. The queries
 * themselves use only standard SQL (no SQLite- or Postgres-specific idioms), so
 * the same `sql` template is portable; `ON CONFLICT ... DO UPDATE/NOTHING` is
 * supported identically by both engines.
 *
 * Column casing: raw SQL returns the database column names, so callers that
 * need camelCase alias explicitly (e.g. `plugin_id AS "pluginId"`). Booleans
 * read back as 0/1 on SQLite and `true/false` on Postgres — normalise with a
 * cast where it matters.
 */

/** Run a query for at most one row. */
export async function dbGet<T>(pdb: PlatformDb, query: SQL): Promise<T | undefined> {
  if (pdb.dialect === 'sqlite') {
    return (pdb.db.get<T>(query) as T | undefined) ?? undefined;
  }
  const result = await pdb.db.execute(query);
  return (result.rows[0] as T | undefined) ?? undefined;
}

/** Run a query returning all rows. */
export async function dbAll<T>(pdb: PlatformDb, query: SQL): Promise<T[]> {
  if (pdb.dialect === 'sqlite') {
    return pdb.db.all<T>(query);
  }
  const result = await pdb.db.execute(query);
  return result.rows as T[];
}

/** Run a statement for its side effects (INSERT/UPDATE/DDL). */
export async function dbRun(pdb: PlatformDb, query: SQL): Promise<void> {
  if (pdb.dialect === 'sqlite') {
    pdb.db.run(query);
    return;
  }
  await pdb.db.execute(query);
}
