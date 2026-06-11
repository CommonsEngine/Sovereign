import { mkdirSync } from 'node:fs';
import { dirname } from 'node:path';
import Database from 'better-sqlite3';
import { getEnv } from './env';

let db: Database.Database | undefined;

function toPath(url: string): string {
  if (url === ':memory:') return url;
  return url.startsWith('file:') ? url.slice('file:'.length) : url;
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
