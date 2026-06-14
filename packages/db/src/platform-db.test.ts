import { describe, expect, it } from 'vitest';
import { createClient } from './client';
import {
  DEFAULT_ROOT_PLUGIN_ID,
  bootstrapPlatformDb,
  getAccountPrefs,
  getDefaultTenant,
  getPlatformSetting,
  setAccountPrefs,
  setPlatformSetting,
  setTenantName,
  type PlatformDb,
} from './platform-db';

async function freshDb(): Promise<PlatformDb> {
  const db = createClient({ url: ':memory:' });
  await bootstrapPlatformDb(db);
  return db;
}

describe('bootstrapPlatformDb', () => {
  it('seeds the default tenant', async () => {
    const tenant = await getDefaultTenant(await freshDb());
    expect(tenant.id).toBe('default');
    expect(tenant.name).toBe('Sovereign');
  });

  it('seeds root_plugin_id with the Launcher default', async () => {
    expect(await getPlatformSetting(await freshDb(), 'root_plugin_id')).toBe(
      DEFAULT_ROOT_PLUGIN_ID,
    );
  });

  it('is idempotent and does not overwrite existing values', async () => {
    const db = await freshDb();
    await setTenantName(db, 'Acme');
    await setPlatformSetting(db, 'root_plugin_id', 'fs.example.tasks');

    await bootstrapPlatformDb(db); // simulate a second startup

    expect((await getDefaultTenant(db)).name).toBe('Acme');
    expect(await getPlatformSetting(db, 'root_plugin_id')).toBe('fs.example.tasks');
  });
});

describe('platform settings helpers', () => {
  it('returns null for an unset key', async () => {
    expect(await getPlatformSetting(await freshDb(), 'no_such_key')).toBeNull();
  });

  it('round-trips a new setting', async () => {
    const db = await freshDb();
    await setPlatformSetting(db, 'invite_only', 'true');
    expect(await getPlatformSetting(db, 'invite_only')).toBe('true');
  });

  it('upserts an existing setting', async () => {
    const db = await freshDb();
    await setPlatformSetting(db, 'invite_only', 'true');
    await setPlatformSetting(db, 'invite_only', 'false');
    expect(await getPlatformSetting(db, 'invite_only')).toBe('false');
  });
});

describe('tenant helpers', () => {
  it('renames the default tenant', async () => {
    const db = await freshDb();
    await setTenantName(db, 'My Workspace');
    expect((await getDefaultTenant(db)).name).toBe('My Workspace');
  });
});

describe('account preferences helpers', () => {
  it('returns UTC + system defaults when no row exists', async () => {
    expect(await getAccountPrefs(await freshDb(), 'u1')).toEqual({
      timezone: 'UTC',
      theme: 'system',
    });
  });

  it('inserts a row on first set and round-trips it', async () => {
    const db = await freshDb();
    const next = await setAccountPrefs(db, 'u1', { timezone: 'America/New_York', theme: 'dark' });
    expect(next).toEqual({ timezone: 'America/New_York', theme: 'dark' });
    expect(await getAccountPrefs(db, 'u1')).toEqual({
      timezone: 'America/New_York',
      theme: 'dark',
    });
  });

  it('merges a partial update, leaving other fields intact', async () => {
    const db = await freshDb();
    await setAccountPrefs(db, 'u1', { timezone: 'Europe/Berlin', theme: 'light' });
    await setAccountPrefs(db, 'u1', { theme: 'dark' });
    expect(await getAccountPrefs(db, 'u1')).toEqual({ timezone: 'Europe/Berlin', theme: 'dark' });
  });

  it('keeps preferences isolated per user', async () => {
    const db = await freshDb();
    await setAccountPrefs(db, 'u1', { theme: 'dark' });
    expect(await getAccountPrefs(db, 'u2')).toEqual({ timezone: 'UTC', theme: 'system' });
  });
});
