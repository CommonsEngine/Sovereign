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
 * database directly — synchronous by contract, which better-sqlite3 supports.
 */
export function getConfig(): PlatformConfig {
  const db = getPlatformDb();
  return {
    tenantName: getDefaultTenant(db).name,
    inviteOnly: getPlatformSetting(db, 'invite_only') === 'true',
    version: getPlatformVersion(),
  };
}
