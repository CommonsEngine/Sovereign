import { type NextRequest, NextResponse } from 'next/server';
import { getInstalledPlugins } from '@/src/registry';
import { decidePluginRoute, underPrefix } from '@/src/route-guard';

const AUTH_URL = process.env.SOVEREIGN_AUTH_URL ?? 'http://localhost:3001';

// Self-fetch address for the runtime's own Node-runtime API routes. The server
// always listens on :3000 (scripts/dev.ts and the start script both pin it),
// so localhost is reliable in every environment — unlike the public URL, which
// may sit behind a reverse proxy the container cannot hairpin through.
const SELF_URL = 'http://localhost:3000';

/**
 * Middleware runs on the Edge runtime, which cannot open the SQLite database.
 * Plugin enabled/disabled state is fetched from the runtime's own
 * /api/admin/plugins/disabled route (Node runtime, excluded from this
 * middleware's matcher) — same round-trip pattern as the auth /api/verify
 * check. Fails open: if the status fetch errors, the route stays reachable
 * (disable is an admin convenience, not a security boundary — adminOnly
 * gating below is independent of it).
 */
async function fetchDisabledPluginIds(): Promise<Set<string>> {
  try {
    const res = await fetch(`${SELF_URL}/api/admin/plugins/disabled`, {
      headers: { authorization: `Bearer ${process.env.SOVEREIGN_ADMIN_KEY ?? ''}` },
    });
    if (!res.ok) return new Set();
    const { disabled } = (await res.json()) as { disabled: string[] };
    return new Set(disabled);
  } catch {
    return new Set();
  }
}

/**
 * The configured root plugin's `routePrefix`, fetched from the Node-runtime
 * route (Edge middleware cannot read the DB). Used to serve the root plugin in
 * place at `/` (PLT-14). Returns null on any failure, so `/` falls through to
 * the placeholder home page rather than erroring.
 */
async function fetchRootPluginPrefix(): Promise<string | null> {
  try {
    const res = await fetch(`${SELF_URL}/api/admin/root-plugin`, {
      headers: { authorization: `Bearer ${process.env.SOVEREIGN_ADMIN_KEY ?? ''}` },
    });
    if (!res.ok) return null;
    const { routePrefix } = (await res.json()) as { routePrefix: string | null };
    return routePrefix;
  } catch {
    return null;
  }
}

/**
 * Session gate + plugin route protection. Verifies the request against the auth
 * server's /api/verify (v0.3 approach; SRS AUTH-05 targets local JWT
 * verification at v0.5). On success the verified user is injected as request
 * headers for downstream server components; otherwise the request is redirected
 * to /login. Routes under an `adminOnly` plugin's prefix are reachable only by
 * `platform:admin` — everyone else gets 403 (SRS §3.4, PLT-03). Routes under a
 * disabled plugin's prefix return 404 (SRS CON-07, PLT-04).
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

  // Only consult plugin status when the path is actually under a plugin prefix.
  const underPlugin = installedPlugins.some((plugin) => underPrefix(pathname, plugin.routePrefix));
  if (underPlugin) {
    const disabledIds = await fetchDisabledPluginIds();
    const decision = decidePluginRoute(pathname, installedPlugins, disabledIds, user.role);
    if (decision === 'not-found') {
      return new NextResponse('Not Found', { status: 404 });
    }
    if (decision === 'forbidden') {
      return new NextResponse('Forbidden', { status: 403 });
    }
  }

  const headers = new Headers(request.headers);
  headers.set('x-sovereign-user-id', user.id);
  headers.set('x-sovereign-user-email', user.email);
  headers.set('x-sovereign-user-role', user.role);
  headers.set('x-sovereign-session-expires-at', String(expiresAt));
  if (user.name != null) headers.set('x-sovereign-user-name', user.name);
  if (user.image != null) headers.set('x-sovereign-user-image', user.image);

  // Serve the configured root plugin in place at `/` (PLT-14) — the URL stays
  // `/` while the plugin's route renders, and the plugin is still reachable at
  // its own routePrefix. Falls through to the placeholder home page when no
  // valid root plugin resolves. `(platform)/page.tsx` keeps a redirect as a
  // belt-and-suspenders fallback for the rare case this fetch fails.
  if (pathname === '/') {
    const rootPrefix = await fetchRootPluginPrefix();
    if (rootPrefix && rootPrefix !== '/') {
      return NextResponse.rewrite(new URL(rootPrefix, request.url), { request: { headers } });
    }
  }

  return NextResponse.next({ request: { headers } });
}

export const config = {
  // Gate everything except auth redirects, internal admin API, and Next static assets.
  matcher: ['/((?!login|register|api/admin|_next/static|_next/image|favicon.ico).*)'],
};
