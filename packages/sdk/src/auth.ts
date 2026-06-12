import { headers } from 'next/headers';
import { NotAuthenticatedError } from './errors';
import type { Session } from './types';

/** Returns the current user session from runtime-injected headers, or null if unauthenticated. */
export async function getSession(): Promise<Session | null> {
  const h = await headers();
  const id = h.get('x-sovereign-user-id');
  if (!id) return null;
  return {
    user: {
      id,
      tenantId: '', // v1: single-tenant; populated in Task 0.5.05
      email: h.get('x-sovereign-user-email') ?? '',
      name: h.get('x-sovereign-user-name') ?? null,
      image: h.get('x-sovereign-user-image') ?? null,
      role: h.get('x-sovereign-user-role') ?? 'platform:user',
    },
    expiresAt: Number(h.get('x-sovereign-session-expires-at') ?? 0),
  };
}

/** Returns the current user session, throwing `NotAuthenticatedError` if unauthenticated. */
export async function requireSession(): Promise<Session> {
  const session = await getSession();
  if (!session) throw new NotAuthenticatedError();
  return session;
}
