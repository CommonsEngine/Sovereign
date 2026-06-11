import type { SovereignManifest } from '@sovereignfs/manifest';
import { registry } from '../generated/registry';

/** All installed plugins, from the generated registry (built by `pnpm generate`). */
export function getInstalledPlugins(): SovereignManifest[] {
  return registry;
}
