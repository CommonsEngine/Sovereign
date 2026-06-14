import { migrate as migrateSqlite } from 'drizzle-orm/better-sqlite3/migrator';
import { migrate as migratePg } from 'drizzle-orm/node-postgres/migrator';
import type { PlatformDb } from './client';

/**
 * Apply pending migrations against a platform client, dispatching on dialect.
 *
 * `migrationsFolder` is a directory of Drizzle-generated migrations (`.sql`
 * files plus a `_journal.json`). Drizzle applies them in journal order and
 * records what has run, so calling this repeatedly is safe (idempotent).
 *
 * Not yet load-bearing: platform tables are still created via the
 * CREATE-TABLE-IF-NOT-EXISTS bootstrap (see ./platform-db); this runner is in
 * place for when drizzle-kit migrations land (0.5.05+).
 */
export async function runMigrations(pdb: PlatformDb, migrationsFolder: string): Promise<void> {
  if (pdb.dialect === 'sqlite') {
    migrateSqlite(pdb.db, { migrationsFolder });
    return;
  }
  await migratePg(pdb.db, { migrationsFolder });
}
