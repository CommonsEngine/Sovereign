import { existsSync, mkdirSync } from 'node:fs';
import { dirname, isAbsolute, join, resolve } from 'node:path';
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
    const path = resolveSqlitePath(resolved.url);
    if (path !== ':memory:') {
      mkdirSync(dirname(path), { recursive: true });
    }
    const sqlite = new Database(path);
    sqlite.pragma('journal_mode = WAL');
    sqlite.pragma('foreign_keys = ON');
    return drizzleSqlite(sqlite, { schema });
  }

  throw new Error(
    'Postgres support is not yet implemented (Task 0.5.03). ' +
      'Set DB_DIALECT=sqlite (or leave it unset) for now.',
  );
}

/**
 * Convert a `file:` URL to a filesystem path. Relative paths resolve against
 * the workspace root (nearest ancestor with pnpm-workspace.yaml), not the
 * process cwd — apps run from their own package directories (runtime/,
 * apps/auth/), and all SQLite files should land in the single root-level
 * data/ directory. Falls back to cwd outside a workspace (standalone builds).
 */
export function resolveSqlitePath(url: string): string {
  if (url === ':memory:') return url;
  const path = url.startsWith('file:') ? url.slice('file:'.length) : url;
  if (isAbsolute(path)) return path;
  return resolve(findWorkspaceRoot(), path);
}

function findWorkspaceRoot(): string {
  let dir = process.cwd();
  for (;;) {
    if (existsSync(join(dir, 'pnpm-workspace.yaml'))) return dir;
    const parent = dirname(dir);
    if (parent === dir) return process.cwd();
    dir = parent;
  }
}
