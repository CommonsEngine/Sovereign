import Database from 'better-sqlite3';
import { drizzle as drizzleSqlite } from 'drizzle-orm/better-sqlite3';
import { resolveDialect, type Dialect } from './dialect';
import * as schema from './schema/sqlite';

export interface DbConfig {
  /** Override the resolved dialect. Defaults to the environment resolution. */
  dialect?: Dialect;
  /** Override the connection URL. Defaults to the environment resolution. */
  url?: string;
}

/**
 * Create a Drizzle client for the configured dialect.
 *
 * SQLite is fully supported. Postgres is recognised but not yet wired — the
 * driver and Postgres schema land in Task 0.5.03; until then this throws a
 * clear error rather than silently misbehaving.
 */
export function createClient(config: DbConfig = {}) {
  const resolved = resolveDialect({
    ...process.env,
    ...(config.dialect ? { DB_DIALECT: config.dialect } : {}),
    ...(config.url ? { DATABASE_URL: config.url } : {}),
  });

  if (resolved.dialect === 'sqlite') {
    const sqlite = new Database(toSqlitePath(resolved.url));
    sqlite.pragma('journal_mode = WAL');
    sqlite.pragma('foreign_keys = ON');
    return drizzleSqlite(sqlite, { schema });
  }

  throw new Error(
    'Postgres support is not yet implemented (Task 0.5.03). ' +
      'Set DB_DIALECT=sqlite (or leave it unset) for now.',
  );
}

function toSqlitePath(url: string): string {
  if (url === ':memory:') return url;
  return url.startsWith('file:') ? url.slice('file:'.length) : url;
}
