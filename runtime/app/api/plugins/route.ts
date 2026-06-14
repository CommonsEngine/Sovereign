import { NextResponse } from 'next/server';
import { eq } from 'drizzle-orm';
import { schema } from '@sovereignfs/db';
import { getPlatformDb } from '@/src/db';
import { getInstalledPlugins } from '@/src/registry';
import { selectLauncherPlugins } from '@/src/launcher-plugins';

/**
 * Launcher-visible plugins for the current user (SRS LCH-01/03/04). Session-
 * gated by the middleware (not under the `/api/admin` exclusion), which injects
 * the verified role as `x-sovereign-user-role` — so this needs no admin key.
 * Returns enabled, non-chrome plugins; admin-only ones only for admins.
 */
export async function GET(request: Request): Promise<Response> {
  const role = request.headers.get('x-sovereign-user-role') ?? 'platform:user';

  const db = getPlatformDb();
  const disabledIds = new Set(
    db
      .select({ pluginId: schema.pluginStatus.pluginId })
      .from(schema.pluginStatus)
      .where(eq(schema.pluginStatus.enabled, false))
      .all()
      .map((r) => r.pluginId),
  );

  const plugins = selectLauncherPlugins(getInstalledPlugins(), disabledIds, role);
  return NextResponse.json({ plugins });
}
