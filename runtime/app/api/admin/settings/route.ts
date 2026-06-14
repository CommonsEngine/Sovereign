import { NextResponse } from 'next/server';
import { eq } from 'drizzle-orm';
import {
  DEFAULT_ROOT_PLUGIN_ID,
  getDefaultTenant,
  getPlatformSetting,
  schema,
  setPlatformSetting,
  setTenantName,
} from '@sovereignfs/db';
import { checkAdminKey } from '@/src/admin-guard';
import { getPlatformDb } from '@/src/db';
import { getInstalledPlugins } from '@/src/registry';
import { validateRootPlugin } from '@/src/root-plugin';

const AUTH_URL = process.env.SOVEREIGN_AUTH_URL ?? 'http://localhost:3001';

async function readSettings() {
  const db = await getPlatformDb();
  const [tenant, inviteOnly, rootPluginId] = await Promise.all([
    getDefaultTenant(db),
    getPlatformSetting(db, 'invite_only'),
    getPlatformSetting(db, 'root_plugin_id'),
  ]);
  return {
    tenantName: tenant.name,
    inviteOnly: inviteOnly === 'true',
    rootPluginId: rootPluginId ?? DEFAULT_ROOT_PLUGIN_ID,
  };
}

export async function GET(request: Request): Promise<Response> {
  const denied = checkAdminKey(request);
  if (denied) return denied;
  return NextResponse.json(await readSettings());
}

export async function PATCH(request: Request): Promise<Response> {
  const denied = checkAdminKey(request);
  if (denied) return denied;

  const body = (await request.json()) as {
    tenantName?: string;
    inviteOnly?: boolean;
    rootPluginId?: string;
  };
  const db = await getPlatformDb();

  if (body.tenantName !== undefined) {
    const name = body.tenantName.trim();
    if (name.length === 0) {
      return NextResponse.json({ error: 'tenantName must not be empty' }, { status: 400 });
    }
    await setTenantName(db, name);
  }

  if (body.rootPluginId !== undefined) {
    const disabledIds = new Set(
      db
        .select({ pluginId: schema.pluginStatus.pluginId })
        .from(schema.pluginStatus)
        .where(eq(schema.pluginStatus.enabled, false))
        .all()
        .map((r) => r.pluginId),
    );
    const result = validateRootPlugin(body.rootPluginId, getInstalledPlugins(), disabledIds);
    if (!result.ok) {
      return NextResponse.json(
        { error: `rootPluginId rejected: ${result.reason}` },
        { status: 400 },
      );
    }
    await setPlatformSetting(db, 'root_plugin_id', body.rootPluginId);
  }

  if (body.inviteOnly !== undefined) {
    if (typeof body.inviteOnly !== 'boolean') {
      return NextResponse.json({ error: 'inviteOnly must be a boolean' }, { status: 400 });
    }
    // Dual-write: the platform copy backs sdk.platform.getConfig(); the auth
    // server's copy is what registration actually enforces (CON-10).
    const authRes = await fetch(`${AUTH_URL}/api/admin/settings`, {
      method: 'PATCH',
      headers: {
        'Content-Type': 'application/json',
        authorization: request.headers.get('authorization') ?? '',
      },
      body: JSON.stringify({ inviteOnly: body.inviteOnly }),
    });
    if (!authRes.ok) {
      return NextResponse.json(
        { error: `auth server rejected invite-only update: ${authRes.status}` },
        { status: 502 },
      );
    }
    await setPlatformSetting(db, 'invite_only', String(body.inviteOnly));
  }

  return NextResponse.json(await readSettings());
}
