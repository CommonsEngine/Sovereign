import { NextResponse } from 'next/server';
import { eq } from 'drizzle-orm';
import { schema } from '@sovereignfs/db';
import { checkAdminKey } from '@/src/admin-guard';
import { getPlatformDb } from '@/src/db';

/**
 * Returns the IDs of disabled plugins. Consumed by the middleware on each
 * gated request — middleware runs on the Edge runtime and cannot open the
 * SQLite database itself, so it asks this Node-runtime route instead (same
 * pattern as the auth /api/verify round-trip).
 */
export async function GET(request: Request): Promise<Response> {
  const denied = checkAdminKey(request);
  if (denied) return denied;

  const db = await getPlatformDb();
  const rows = db
    .select({ pluginId: schema.pluginStatus.pluginId })
    .from(schema.pluginStatus)
    .where(eq(schema.pluginStatus.enabled, false))
    .all();

  return NextResponse.json({ disabled: rows.map((r) => r.pluginId) });
}
