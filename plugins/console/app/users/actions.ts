'use server';

import { revalidatePath } from 'next/cache';
import { sdk } from '@sovereignfs/sdk';

const AUTH_URL = process.env.SOVEREIGN_AUTH_URL ?? 'http://localhost:3001';

async function adminFetch(path: string, init?: RequestInit): Promise<Response> {
  const adminKey = process.env.SOVEREIGN_ADMIN_KEY ?? '';
  return fetch(`${AUTH_URL}${path}`, {
    ...init,
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${adminKey}`,
      ...(init?.headers as Record<string, string>),
    },
  });
}

export async function changeRoleAction(formData: FormData): Promise<void> {
  await sdk.auth.requireSession();
  const userId = formData.get('userId') as string;
  const role = formData.get('role') as 'platform:admin' | 'platform:user';
  const res = await adminFetch(`/api/admin/users/${userId}`, {
    method: 'PATCH',
    body: JSON.stringify({ role }),
  });
  if (!res.ok) throw new Error(`Failed to change role: ${res.status}`);
  revalidatePath('/console/users');
}

export async function toggleActiveAction(formData: FormData): Promise<void> {
  await sdk.auth.requireSession();
  const userId = formData.get('userId') as string;
  const active = formData.get('active') === 'true';
  const res = await adminFetch(`/api/admin/users/${userId}`, {
    method: 'PATCH',
    body: JSON.stringify({ active }),
  });
  if (!res.ok) throw new Error(`Failed to update user status: ${res.status}`);
  revalidatePath('/console/users');
}

export type InviteState =
  | { success: true; token: string; email: string }
  | { success: false; error: string };

export async function sendInviteAction(
  _prev: InviteState | null,
  formData: FormData,
): Promise<InviteState> {
  await sdk.auth.requireSession();

  const email = (formData.get('email') as string | null)?.trim();
  const expiresInDaysRaw = formData.get('expiresInDays') as string | null;
  const expiresInDays = expiresInDaysRaw ? Number(expiresInDaysRaw) : undefined;

  if (!email) return { success: false, error: 'Email is required.' };

  const res = await adminFetch('/api/admin/invites', {
    method: 'POST',
    body: JSON.stringify({ email, expiresInDays }),
  });
  if (!res.ok) return { success: false, error: `Failed to create invite: ${res.status}` };

  const { token } = (await res.json()) as { token: string; email: string };

  const runtimeUrl = process.env.NEXT_PUBLIC_RUNTIME_URL ?? 'http://localhost:3000';
  const registerUrl = `${runtimeUrl}/register`;
  await sdk.mailer.send({
    to: email,
    subject: 'You have been invited to Sovereign',
    text: [
      'You have been invited to join this Sovereign instance.',
      '',
      `Create your account at: ${registerUrl}`,
      '',
      'Use the email address this invitation was sent to when registering.',
    ].join('\n'),
    html: `<p>You have been invited to join this Sovereign instance.</p><p><a href="${registerUrl}">Create your account</a></p><p>Use the email address this invitation was sent to when registering.</p>`,
  });

  return { success: true, token, email };
}
