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

function freshDb(): PlatformDb {
  const db = createClient({ url: ':memory:' });
  bootstrapPlatformDb(db);
  return db;
}

describe('bootstrapPlatformDb', () => {
  it('seeds the default tenant', () => {
    const tenant = getDefaultTenant(freshDb());
    expect(tenant.id).toBe('default');
    expect(tenant.name).toBe('Sovereign');
  });

  it('seeds root_plugin_id with the Launcher default', () => {
    expect(getPlatformSetting(freshDb(), 'root_plugin_id')).toBe(DEFAULT_ROOT_PLUGIN_ID);
  });

  it('is idempotent and does not overwrite existing values', () => {
    const db = freshDb();
    setTenantName(db, 'Acme');
    setPlatformSetting(db, 'root_plugin_id', 'fs.example.tasks');

    bootstrapPlatformDb(db); // simulate a second startup

    expect(getDefaultTenant(db).name).toBe('Acme');
    expect(getPlatformSetting(db, 'root_plugin_id')).toBe('fs.example.tasks');
  });
});

describe('platform settings helpers', () => {
  it('returns null for an unset key', () => {
    expect(getPlatformSetting(freshDb(), 'no_such_key')).toBeNull();
  });

  it('round-trips a new setting', () => {
    const db = freshDb();
    setPlatformSetting(db, 'invite_only', 'true');
    expect(getPlatformSetting(db, 'invite_only')).toBe('true');
  });

  it('upserts an existing setting', () => {
    const db = freshDb();
    setPlatformSetting(db, 'invite_only', 'true');
    setPlatformSetting(db, 'invite_only', 'false');
    expect(getPlatformSetting(db, 'invite_only')).toBe('false');
  });
});

describe('tenant helpers', () => {
  it('renames the default tenant', () => {
    const db = freshDb();
    setTenantName(db, 'My Workspace');
    expect(getDefaultTenant(db).name).toBe('My Workspace');
  });
});

describe('account preferences helpers', () => {
  it('returns UTC + system defaults when no row exists', () => {
    expect(getAccountPrefs(freshDb(), 'u1')).toEqual({ timezone: 'UTC', theme: 'system' });
  });

  it('inserts a row on first set and round-trips it', () => {
    const db = freshDb();
    const next = setAccountPrefs(db, 'u1', { timezone: 'America/New_York', theme: 'dark' });
    expect(next).toEqual({ timezone: 'America/New_York', theme: 'dark' });
    expect(getAccountPrefs(db, 'u1')).toEqual({ timezone: 'America/New_York', theme: 'dark' });
  });

  it('merges a partial update, leaving other fields intact', () => {
    const db = freshDb();
    setAccountPrefs(db, 'u1', { timezone: 'Europe/Berlin', theme: 'light' });
    setAccountPrefs(db, 'u1', { theme: 'dark' });
    expect(getAccountPrefs(db, 'u1')).toEqual({ timezone: 'Europe/Berlin', theme: 'dark' });
  });

  it('keeps preferences isolated per user', () => {
    const db = freshDb();
    setAccountPrefs(db, 'u1', { theme: 'dark' });
    expect(getAccountPrefs(db, 'u2')).toEqual({ timezone: 'UTC', theme: 'system' });
  });
});
