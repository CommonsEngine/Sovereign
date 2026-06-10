import { NotImplementedError } from './errors';
import type { Session } from './types';

/** Returns the current user session, or null if unauthenticated. */
export function getSession(): Promise<Session | null> {
  throw new NotImplementedError(
    'sdk.auth.getSession() is provided by the Sovereign runtime and has no standalone implementation.',
  );
}

/** Returns the current user session, throwing if unauthenticated. */
export function requireSession(): Promise<Session> {
  throw new NotImplementedError(
    'sdk.auth.requireSession() is provided by the Sovereign runtime and has no standalone implementation.',
  );
}
