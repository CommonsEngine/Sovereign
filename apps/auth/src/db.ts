import { existsSync, mkdirSync } from 'node:fs';
import { dirname, isAbsolute, join, resolve } from 'node:path';
import Database from 'better-sqlite3';
import { getEnv } from './env';

let db: Database.Database | undefined;

/**
 * Convert a `file:` URL to a filesystem path. Relative paths resolve against
 * the workspace root (nearest ancestor with pnpm-workspace.yaml), not the
 * process cwd — the auth server runs from apps/auth/, and all SQLite files
 * should land in the single root-level data/ directory. Mirrors the
 * resolution in packages/db (not imported: the auth server intentionally
 * does not depend on packages/db).
 */
function toPath(url: string): string {
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

/**
 * The auth server's own SQLite database. better-auth manages the
 * user/session/account/verification tables; we add an `invites` table for the
 * invite-only gate (invite creation is a Console feature, Task 0.4.02).
 */
export function getDb(): Database.Database {
  if (!db) {
    const path = toPath(getEnv().databaseUrl);
    if (path !== ':memory:') {
      mkdirSync(dirname(path), { recursive: true });
    }
    const conn = new Database(path);
    conn.pragma('journal_mode = WAL');
    conn.pragma('foreign_keys = ON');
    conn.exec(`
      CREATE TABLE IF NOT EXISTS invites (
        token TEXT PRIMARY KEY,
        email TEXT NOT NULL,
        created_at INTEGER NOT NULL,
        expires_at INTEGER,
        consumed_at INTEGER
      );
    `);
    db = conn;
  }
  return db;
}
