import { describe, expect, it } from 'vitest';
import { createClient } from './client';
import {
  DEFAULT_ROOT_PLUGIN_ID,
  bootstrapPlatformDb,
  getDefaultTenant,
  getPlatformSetting,
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
