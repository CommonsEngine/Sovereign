'use server';

import { revalidatePath } from 'next/cache';
import { headers } from 'next/headers';
import { sdk } from '@sovereignfs/sdk';

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
