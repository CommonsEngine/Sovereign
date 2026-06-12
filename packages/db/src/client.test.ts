import { isAbsolute, resolve } from 'node:path';
import { sql } from 'drizzle-orm';
import { describe, expect, it } from 'vitest';
import { PLUGIN_STATUS_BOOTSTRAP_SQL } from './bootstrap';
import { createClient, resolveSqlitePath } from './client';
import * as schema from './schema/sqlite';

describe('resolveSqlitePath', () => {
  it('passes :memory: through untouched', () => {
    expect(resolveSqlitePath(':memory:')).toBe(':memory:');
  });

  it('passes absolute paths through untouched', () => {
    expect(resolveSqlitePath('/tmp/x.db')).toBe('/tmp/x.db');
    expect(resolveSqlitePath('file:/tmp/x.db')).toBe('/tmp/x.db');
  });

  it('resolves relative paths against the workspace root, not the cwd', () => {
    // Vitest runs from the repo root, which is the workspace root.
    const expected = resolve(process.cwd(), 'data/sovereign.db');
    expect(resolveSqlitePath('file:./data/sovereign.db')).toBe(expected);
    expect(resolveSqlitePath('./data/sovereign.db')).toBe(expected);
  });

  it('always returns an absolute path for file-backed databases', () => {
    expect(isAbsolute(resolveSqlitePath('file:./anywhere.db'))).toBe(true);
  });
});

describe('createClient (sqlite, in-memory)', () => {
  it('opens an in-memory database and applies pragmas', () => {
    const db = createClient({ url: ':memory:' });
    const row = db.get<{ foreign_keys: number }>(sql`PRAGMA foreign_keys`);
    expect(row?.foreign_keys).toBe(1);
  });

  it('round-trips plugin_status rows through the Drizzle schema', () => {
    const db = createClient({ url: ':memory:' });
    db.run(sql.raw(PLUGIN_STATUS_BOOTSTRAP_SQL));

    db.insert(schema.pluginStatus)
      .values({ pluginId: 'fs.test.alpha', tenantId: 'default', enabled: false, updatedAt: 100 })
      .run();

    const rows = db.select().from(schema.pluginStatus).all();
    expect(rows).toHaveLength(1);
    expect(rows[0]).toEqual({
      pluginId: 'fs.test.alpha',
      tenantId: 'default',
      enabled: false,
      updatedAt: 100,
    });
  });

  it('upserts on plugin_id conflict (the toggle pattern)', () => {
    const db = createClient({ url: ':memory:' });
    db.run(sql.raw(PLUGIN_STATUS_BOOTSTRAP_SQL));

    const upsert = (enabled: boolean, updatedAt: number) =>
      db
        .insert(schema.pluginStatus)
        .values({ pluginId: 'fs.test.alpha', tenantId: 'default', enabled, updatedAt })
        .onConflictDoUpdate({
          target: schema.pluginStatus.pluginId,
          set: { enabled, updatedAt },
        })
        .run();

    upsert(false, 100);
    upsert(true, 200);

    const rows = db.select().from(schema.pluginStatus).all();
    expect(rows).toHaveLength(1);
    expect(rows[0]?.enabled).toBe(true);
    expect(rows[0]?.updatedAt).toBe(200);
  });

  it('throws a clear error for the unwired postgres dialect', () => {
    expect(() => createClient({ dialect: 'postgres', url: 'postgres://u:p@host/db' })).toThrow(
      /Postgres support is not yet implemented/,
    );
  });
});
