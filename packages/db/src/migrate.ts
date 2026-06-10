import type { BetterSQLite3Database } from 'drizzle-orm/better-sqlite3';
import { migrate as migrateSqlite } from 'drizzle-orm/better-sqlite3/migrator';

/**
 * Apply pending migrations against a SQLite Drizzle client.
 *
 * `migrationsFolder` is a directory of Drizzle-generated migrations (`.sql`
 * files plus a `_journal.json`). Drizzle applies them in journal order and
 * records what has run, so calling this repeatedly is safe (idempotent).
 *
 * Note: this uses Drizzle's standard folder+journal migrator rather than a raw
 * array of file paths — the journal is what gives ordering and idempotency.
 * Postgres migrations arrive with the Postgres driver in Task 0.5.03.
 */
export function runMigrations<TSchema extends Record<string, unknown>>(
  db: BetterSQLite3Database<TSchema>,
  migrationsFolder: string,
): void {
  migrateSqlite(db, { migrationsFolder });
}
