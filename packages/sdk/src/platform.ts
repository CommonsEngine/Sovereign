import { NotImplementedError } from './errors';
import type { PlatformConfig } from './types';

/** Returns the platform runtime configuration. */
export function getConfig(): PlatformConfig {
  throw new NotImplementedError(
    'sdk.platform.getConfig() is provided by the Sovereign runtime and has no standalone implementation.',
  );
}
