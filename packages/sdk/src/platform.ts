import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import {
  findWorkspaceRoot,
  getDefaultTenant,
  getPlatformDb,
  getPlatformSetting,
} from '@sovereignfs/db';
import type { PlatformConfig } from './types';

let _version: string | undefined;

/**
 * The platform version from the workspace root package.json (tracks roadmap
 * milestones: 0.4.x → 0.5.x → 1.0.x). Read once per process; '0.0.0' when the
 * root manifest is unreadable (standalone contexts).
 */
function getPlatformVersion(): string {
  if (_version) return _version;
  try {
    const raw = readFileSync(join(findWorkspaceRoot(), 'package.json'), 'utf8');
    _version = (JSON.parse(raw) as { version?: string }).version ?? '0.0.0';
  } catch {
    _version = '0.0.0';
  }
  return _version;
}

/**
 * Returns the platform runtime configuration (SRS PLT-06). Reads the platform
 * database directly. Async by contract: the platform DB is dialect-agnostic and
 * Postgres (node-postgres) has no synchronous query, so this resolves a promise
 * (on SQLite the underlying reads complete synchronously).
 */
export async function getConfig(): Promise<PlatformConfig> {
  const db = await getPlatformDb();
  const [tenant, inviteOnly] = await Promise.all([
    getDefaultTenant(db),
    getPlatformSetting(db, 'invite_only'),
  ]);
  return {
    tenantName: tenant.name,
    inviteOnly: inviteOnly === 'true',
    version: getPlatformVersion(),
  };
}
