import { NotImplementedError } from './errors';
import type { DrizzleClient } from './types';

/** Returns the platform's scoped Drizzle client. */
export function getClient(): DrizzleClient {
  throw new NotImplementedError(
    'sdk.db.getClient() is provided by the Sovereign runtime and has no standalone implementation.',
  );
}
