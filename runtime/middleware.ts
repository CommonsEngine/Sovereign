import { type NextRequest, NextResponse } from 'next/server';

const AUTH_URL = process.env.SOVEREIGN_AUTH_URL ?? 'http://localhost:3001';

/**
 * Session gate. Verifies the request against the auth server's /api/verify
 * (v0.3 approach; SRS AUTH-05 targets local JWT verification at v0.5). On
 * success the verified user is injected as request headers for downstream
 * server components; otherwise the request is redirected to /login.
 */
export async function middleware(request: NextRequest): Promise<NextResponse> {
  const verify = await fetch(`${AUTH_URL}/api/verify`, {
    headers: { cookie: request.headers.get('cookie') ?? '' },
  });

  if (!verify.ok) {
    return NextResponse.redirect(new URL('/login', request.url));
  }

  const { user } = (await verify.json()) as {
    user: { id: string; email: string; role: string };
  };

  const headers = new Headers(request.headers);
  headers.set('x-sovereign-user-id', user.id);
  headers.set('x-sovereign-user-email', user.email);
  headers.set('x-sovereign-user-role', user.role);
  return NextResponse.next({ request: { headers } });
}

export const config = {
  // Gate everything except the login redirect and Next static assets.
  matcher: ['/((?!login|_next/static|_next/image|favicon.ico).*)'],
};
