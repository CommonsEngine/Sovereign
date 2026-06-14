import { authGet, authRun } from './db';

/**
 * Resolve the effective invite-only flag: a stored Console setting overrides
 * the AUTH_INVITE_ONLY env default; when nothing is stored, the env value
 * applies (CON-10 — toggling must not require an env edit or restart).
 */
export function resolveInviteOnly(
  storedValue: string | null | undefined,
  envDefault: boolean,
): boolean {
  if (storedValue === 'true') return true;
  if (storedValue === 'false') return false;
  return envDefault;
}

/** Read the stored invite-only setting; null when never toggled. */
export async function readInviteOnlySetting(): Promise<string | null> {
  const row = await authGet<{ value: string }>(
    "SELECT value FROM auth_settings WHERE key = 'invite_only'",
  );
  return row?.value ?? null;
}

/** Persist the invite-only setting (upsert). */
export async function writeInviteOnlySetting(inviteOnly: boolean): Promise<void> {
  const now = Math.floor(Date.now() / 1000);
  await authRun(
    `INSERT INTO auth_settings (key, value, updated_at) VALUES ('invite_only', ?, ?)
     ON CONFLICT (key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at`,
    [String(inviteOnly), now],
  );
}
