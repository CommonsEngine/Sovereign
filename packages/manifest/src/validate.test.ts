import { describe, expect, it } from 'vitest';
import { validateManifest } from './validate';

const base = {
  schemaVersion: 1,
  id: 'com.sovereign.tasks',
  name: 'Tasks',
  version: '1.0.0',
  type: 'platform',
  runtime: 'native',
  routePrefix: '/tasks',
  permissions: ['auth:session', 'db:readWrite'],
  compatibility: { minPlatformVersion: '0.4.0' },
};

describe('validateManifest', () => {
  it('accepts a valid platform manifest', () => {
    const res = validateManifest(base);
    expect(res.valid).toBe(true);
  });

  it('fails when a required field is missing', () => {
    const clone: Record<string, unknown> = { ...base };
    delete clone.schemaVersion;
    const res = validateManifest(clone);
    expect(res.valid).toBe(false);
    if (!res.valid) {
      expect(res.errors.join(' ')).toContain('schemaVersion');
    }
  });

  it('fails on an invalid enum value', () => {
    const res = validateManifest({ ...base, runtime: 'wasm' });
    expect(res.valid).toBe(false);
    if (!res.valid) {
      expect(res.errors.join(' ')).toContain('runtime');
    }
  });

  it('requires repository when type is "sovereign"', () => {
    const res = validateManifest({ ...base, type: 'sovereign' });
    expect(res.valid).toBe(false);
    if (!res.valid) {
      expect(res.errors.join(' ')).toContain('repository');
    }
  });

  it('accepts a "sovereign" manifest that declares a repository', () => {
    const res = validateManifest({
      ...base,
      type: 'sovereign',
      repository: 'https://github.com/CommonsEngine/sovereign-plugin-tasks',
    });
    expect(res.valid).toBe(true);
  });

  it('rejects unknown fields (strict)', () => {
    const res = validateManifest({ ...base, bogus: true });
    expect(res.valid).toBe(false);
  });

  it('rejects a routePrefix that does not start with "/"', () => {
    const res = validateManifest({ ...base, routePrefix: 'tasks' });
    expect(res.valid).toBe(false);
    if (!res.valid) {
      expect(res.errors.join(' ')).toContain('routePrefix');
    }
  });
});
