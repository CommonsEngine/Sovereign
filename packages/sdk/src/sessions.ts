import type { ActiveSession } from './types';

/** The session fields better-auth's list-sessions returns that we surface. */
export interface RawSession {
  token: string;
  userAgent?: string | null;
  ipAddress?: string | null;
  createdAt: string;
  updatedAt: string;
  expiresAt: string;
}

/**
 * Project better-auth sessions into the SDK's `ActiveSession` shape, flag the
 * one matching the current request's token, and order it first, then the rest
 * newest-first (SRS ACC-05). Pure — the network fetch lives in `auth.ts`.
 */
export function markCurrentSessions(
  sessions: readonly RawSession[],
  currentToken: string | null,
): ActiveSession[] {
  return sessions
    .map((s) => ({
      token: s.token,
      current: s.token === currentToken,
      userAgent: s.userAgent ?? null,
      ipAddress: s.ipAddress ?? null,
      createdAt: s.createdAt,
      updatedAt: s.updatedAt,
      expiresAt: s.expiresAt,
    }))
    .sort((a, b) => {
      if (a.current !== b.current) return a.current ? -1 : 1;
      return a.createdAt < b.createdAt ? 1 : -1;
    });
}
