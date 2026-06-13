import type { PluginRouteInfo } from './route-guard';

export type RootPluginValidation =
  | { ok: true }
  | { ok: false; reason: 'not-installed' | 'disabled' | 'admin-only' };

/**
 * Whether a plugin may be configured as the root plugin (SRS CON-11): it must
 * be installed, enabled, and not adminOnly (every signed-in user lands on `/`,
 * so an admin-gated root would 403 regular users).
 */
export function validateRootPlugin(
  pluginId: string,
  plugins: readonly PluginRouteInfo[],
  disabledIds: ReadonlySet<string>,
): RootPluginValidation {
  const plugin = plugins.find((p) => p.id === pluginId);
  if (!plugin) return { ok: false, reason: 'not-installed' };
  if (disabledIds.has(pluginId)) return { ok: false, reason: 'disabled' };
  if (plugin.adminOnly) return { ok: false, reason: 'admin-only' };
  return { ok: true };
}
