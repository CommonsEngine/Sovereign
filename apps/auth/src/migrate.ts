import { getMigrations } from 'better-auth/db/migration';
import { getAuthOptions } from './auth';
import { ensureAuthTables } from './db';

/**
 * Apply better-auth's schema migrations (user/session/account/verification) and
 * create the auth server's own tables (invites, auth_settings). Both are
 * dialect-aware and idempotent — safe to run on every startup.
 */
export async function runAuthMigrations(): Promise<void> {
  const { runMigrations } = await getMigrations(getAuthOptions());
  await runMigrations();
  await ensureAuthTables();
}
