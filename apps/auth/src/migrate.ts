import { getMigrations } from 'better-auth/db/migration';
import { getAuthOptions } from './auth';

/**
 * Apply better-auth's schema migrations (user/session/account/verification) to
 * the auth database. Idempotent — safe to run on every startup.
 */
export async function runAuthMigrations(): Promise<void> {
  const { runMigrations } = await getMigrations(getAuthOptions());
  await runMigrations();
}
