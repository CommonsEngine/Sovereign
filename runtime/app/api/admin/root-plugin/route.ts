import { NextResponse } from 'next/server';
import { eq } from 'drizzle-orm';
import { DEFAULT_ROOT_PLUGIN_ID, getPlatformSetting, schema } from '@sovereignfs/db';
import { checkAdminKey } from '@/src/admin-guard';
import { getPlatformDb } from '@/src/db';
import { getInstalledPlugins } from '@/src/registry';
import { resolveRootRoutePrefix } from '@/src/root-plugin';

/**
 * The `routePrefix` the platform root `/` should serve in place (PLT-14), or
 * null when the configured root plugin is not a valid root. The middleware
 * (Edge — no DB access) fetches this to rewrite `/`, the same round-trip
 * pattern as `/api/admin/plugins/disabled`.
 */
export async function GET(request: Request): Promise<Response> {
  const denied = checkAdminKey(request);
  if (denied) return denied;

  const db = await getPlatformDb();
  const rootPluginId = (await getPlatformSetting(db, 'root_plugin_id')) ?? DEFAULT_ROOT_PLUGIN_ID;
  const disabledIds = new Set(
    db
      .select({ pluginId: schema.pluginStatus.pluginId })
      .from(schema.pluginStatus)
      .where(eq(schema.pluginStatus.enabled, false))
      .all()
      .map((r) => r.pluginId),
  );

  const routePrefix = resolveRootRoutePrefix(rootPluginId, getInstalledPlugins(), disabledIds);
  return NextResponse.json({ routePrefix });
}
