'use server';

import { revalidatePath } from 'next/cache';
import { sdk } from '@sovereignfs/sdk';

const RUNTIME_URL = process.env.NEXT_PUBLIC_RUNTIME_URL ?? 'http://localhost:3000';

async function adminFetch(path: string, init?: RequestInit): Promise<Response> {
  const adminKey = process.env.SOVEREIGN_ADMIN_KEY ?? '';
  return fetch(`${RUNTIME_URL}${path}`, {
    ...init,
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${adminKey}`,
      ...(init?.headers as Record<string, string>),
    },
  });
}

export async function togglePluginAction(formData: FormData): Promise<void> {
  await sdk.auth.requireSession();
  const pluginId = formData.get('pluginId') as string;
  const enabled = formData.get('enabled') === 'true';
  const res = await adminFetch(`/api/admin/plugins/${encodeURIComponent(pluginId)}`, {
    method: 'PATCH',
    body: JSON.stringify({ enabled }),
  });
  if (!res.ok) throw new Error(`Failed to toggle plugin: ${res.status}`);
  revalidatePath('/console/plugins');
}
