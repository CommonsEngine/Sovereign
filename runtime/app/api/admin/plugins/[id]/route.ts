import { NextResponse } from 'next/server';
import { schema } from '@sovereignfs/db';
import { checkAdminKey } from '@/src/admin-guard';
import { getPlatformDb } from '@/src/db';
import { getInstalledPlugins } from '@/src/registry';

interface RouteParams {
  params: Promise<{ id: string }>;
}

export async function PATCH(request: Request, { params }: RouteParams): Promise<Response> {
  const denied = checkAdminKey(request);
  if (denied) return denied;

  const { id } = await params;
  const installed = getInstalledPlugins();
  if (!installed.some((p) => p.id === id)) {
    return NextResponse.json({ error: 'plugin not found' }, { status: 404 });
  }

  const body = (await request.json()) as { enabled?: boolean };
  if (typeof body.enabled !== 'boolean') {
    return NextResponse.json({ error: 'enabled (boolean) is required' }, { status: 400 });
  }

  const db = await getPlatformDb();
  const now = Math.floor(Date.now() / 1000);

  db.insert(schema.pluginStatus)
    .values({ pluginId: id, tenantId: 'default', enabled: body.enabled, updatedAt: now })
    .onConflictDoUpdate({
      target: schema.pluginStatus.pluginId,
      set: { enabled: body.enabled, updatedAt: now },
    })
    .run();

  return NextResponse.json({ id, enabled: body.enabled });
}
