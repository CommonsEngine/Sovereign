'use server';

import { revalidatePath } from 'next/cache';
import { sdk } from '@sovereignfs/sdk';

// Self-fetch address for the runtime's own admin API — the server always
// listens on :3000 (see plugins/actions.ts for the reverse-proxy rationale).
const SELF_URL = 'http://localhost:3000';

async function patchSettings(body: Record<string, unknown>): Promise<void> {
  await sdk.auth.requireSession();
  const adminKey = process.env.SOVEREIGN_ADMIN_KEY ?? '';
  const res = await fetch(`${SELF_URL}/api/admin/settings`, {
    method: 'PATCH',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${adminKey}`,
    },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    const detail = ((await res.json().catch(() => null)) as { error?: string } | null)?.error;
    throw new Error(detail ?? `Failed to update settings: ${res.status}`);
  }
  revalidatePath('/console/settings');
  revalidatePath('/');
}

export async function updateTenantNameAction(formData: FormData): Promise<void> {
  const tenantName = (formData.get('tenantName') as string | null)?.trim();
  if (!tenantName) throw new Error('Tenant name is required.');
  await patchSettings({ tenantName });
}

export async function updateInviteOnlyAction(formData: FormData): Promise<void> {
  await patchSettings({ inviteOnly: formData.get('inviteOnly') === 'on' });
}

export async function updateRootPluginAction(formData: FormData): Promise<void> {
  const rootPluginId = formData.get('rootPluginId') as string | null;
  if (!rootPluginId) throw new Error('Select a plugin.');
  await patchSettings({ rootPluginId });
}
