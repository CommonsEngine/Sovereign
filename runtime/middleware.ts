import { type NextRequest, NextResponse } from 'next/server';
import { eq } from 'drizzle-orm';
import { schema } from '@sovereignfs/db';
import { getInstalledPlugins } from '@/src/registry';
import { getPlatformDb } from '@/src/db';

const AUTH_URL = process.env.SOVEREIGN_AUTH_URL ?? 'http://localhost:3001';

/** Whether a request path falls under a plugin's routePrefix. */
function underPrefix(pathname: string, routePrefix: string): boolean {
  return pathname === routePrefix || pathname.startsWith(`${routePrefix}/`);
}

/**
 * Session gate + plugin route protection. Verifies the request against the auth
 * server's /api/verify (v0.3 approach; SRS AUTH-05 targets local JWT
 * verification at v0.5). On success the verified user is injected as request
 * headers for downstream server components; otherwise the request is redirected
 * to /login. Routes under an `adminOnly` plugin's prefix are reachable only by
 * `platform:admin` — everyone else gets 403 (SRS §3.4, PLT-03).
 */
export async function middleware(request: NextRequest): Promise<NextResponse> {
  const verify = await fetch(`${AUTH_URL}/api/verify`, {
    headers: { cookie: request.headers.get('cookie') ?? '' },
  });

  if (!verify.ok) {
    return NextResponse.redirect(new URL('/login', request.url));
  }

  const payload = (await verify.json()) as {
    user: { id: string; email: string; name: string | null; image: string | null; role: string };
    expiresAt: number;
  };
  const { user, expiresAt } = payload;

  const { pathname } = request.nextUrl;
  const installedPlugins = getInstalledPlugins();

  // Check plugin_status table to block disabled-plugin routes.
  const db = getPlatformDb();
  const disabledIds = new Set(
    db
      .select({ pluginId: schema.pluginStatus.pluginId })
      .from(schema.pluginStatus)
      .where(eq(schema.pluginStatus.enabled, false))
      .all()
      .map((r) => r.pluginId),
  );
  const isDisabled = installedPlugins.some(
    (plugin) => disabledIds.has(plugin.id) && underPrefix(pathname, plugin.routePrefix),
  );
  if (isDisabled) {
    return new NextResponse('Not Found', { status: 404 });
  }

  const requiresAdmin = installedPlugins.some(
    (plugin) => plugin.adminOnly && underPrefix(pathname, plugin.routePrefix),
  );
  if (requiresAdmin && user.role !== 'platform:admin') {
    return new NextResponse('Forbidden', { status: 403 });
  }

  const headers = new Headers(request.headers);
  headers.set('x-sovereign-user-id', user.id);
  headers.set('x-sovereign-user-email', user.email);
  headers.set('x-sovereign-user-role', user.role);
  headers.set('x-sovereign-session-expires-at', String(expiresAt));
  if (user.name != null) headers.set('x-sovereign-user-name', user.name);
  if (user.image != null) headers.set('x-sovereign-user-image', user.image);
  return NextResponse.next({ request: { headers } });
}

export const config = {
  // Gate everything except auth redirects, internal admin API, and Next static assets.
  matcher: ['/((?!login|register|api/admin|_next/static|_next/image|favicon.ico).*)'],
};
