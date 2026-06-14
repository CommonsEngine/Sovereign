'use server';

import { revalidatePath } from 'next/cache';
import { headers } from 'next/headers';
import { sdk } from '@sovereignfs/sdk';
import { validatePasswordChange } from './_lib/password';

const AUTH_URL = process.env.SOVEREIGN_AUTH_URL ?? 'http://localhost:3001';
const SELF_URL = 'http://localhost:3000';

async function sessionCookie(): Promise<string> {
  return (await headers()).get('cookie') ?? '';
}

/** Change the display name (ACC-02). Delegates to better-auth's update-user. */
export async function updateDisplayNameAction(formData: FormData): Promise<void> {
  await sdk.auth.requireSession();
  const name = (formData.get('name') as string | null)?.trim() ?? '';
  if (name.length === 0) throw new Error('Display name is required.');
  if (name.length > 100) throw new Error('Display name must be 100 characters or fewer.');

  const res = await fetch(`${AUTH_URL}/api/auth/update-user`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      cookie: await sessionCookie(),
      // better-auth enforces a CSRF Origin check; the auth server's own base
      // URL is its default trusted origin for this server-to-server call.
      origin: AUTH_URL,
    },
    body: JSON.stringify({ name }),
  });
  if (!res.ok) throw new Error(`Failed to update display name: ${res.status}`);
  revalidatePath('/account/profile');
}

/** Persist a preference change (ACC-07/08) via the runtime account-prefs route. */
async function patchPrefs(body: Record<string, unknown>): Promise<void> {
  await sdk.auth.requireSession();
  const res = await fetch(`${SELF_URL}/api/account/prefs`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json', cookie: await sessionCookie() },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    const detail = ((await res.json().catch(() => null)) as { error?: string } | null)?.error;
    throw new Error(detail ?? `Failed to save preference: ${res.status}`);
  }
  revalidatePath('/account/preferences');
}

export async function updateTimezoneAction(timezone: string): Promise<void> {
  await patchPrefs({ timezone });
}

export async function updateThemeAction(theme: string): Promise<void> {
  await patchPrefs({ theme });
}

// ── Security (ACC-04/05/06) ───────────────────────────────────────────────

export type PasswordState = { ok: true } | { ok: false; error: string } | null;

/** Change password (ACC-04), surfacing better-auth's error for the form. */
export async function changePasswordAction(
  _prev: PasswordState,
  formData: FormData,
): Promise<PasswordState> {
  await sdk.auth.requireSession();
  const currentPassword = (formData.get('currentPassword') as string | null) ?? '';
  const newPassword = (formData.get('newPassword') as string | null) ?? '';
  const confirm = (formData.get('confirmPassword') as string | null) ?? '';

  const invalid = validatePasswordChange(newPassword, confirm);
  if (invalid) return { ok: false, error: invalid };

  try {
    await sdk.auth.changePassword({ currentPassword, newPassword });
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : 'Failed to change password.' };
  }
  return { ok: true };
}

/** Revoke another session (ACC-06). The current session can't be revoked here. */
export async function revokeSessionAction(formData: FormData): Promise<void> {
  await sdk.auth.requireSession();
  const token = formData.get('token') as string | null;
  const isCurrent = formData.get('current') === 'true';
  if (!token || isCurrent) return;
  await sdk.auth.revokeSession(token);
  revalidatePath('/account/security');
}
