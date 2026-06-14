import { NextResponse } from 'next/server';
import { getAccountPrefs, setAccountPrefs } from '@sovereignfs/db';
import { getPlatformDb } from '@/src/db';
import { isValidTheme, isValidTimezone } from '@/src/account';

/**
 * Per-user Account preferences (ACC-07/08). Session-gated by the middleware,
 * which injects the verified `x-sovereign-user-id`. Plugins can't read the
 * platform DB directly (SDK boundary), so the Account plugin reads/writes here
 * (forwarding the session cookie) until `sdk.db` lands.
 */
function currentUserId(request: Request): string | null {
  return request.headers.get('x-sovereign-user-id');
}

export async function GET(request: Request): Promise<Response> {
  const userId = currentUserId(request);
  if (!userId) return NextResponse.json({ error: 'unauthenticated' }, { status: 401 });
  return NextResponse.json(getAccountPrefs(getPlatformDb(), userId));
}

export async function PATCH(request: Request): Promise<Response> {
  const userId = currentUserId(request);
  if (!userId) return NextResponse.json({ error: 'unauthenticated' }, { status: 401 });

  const body = (await request.json()) as { timezone?: unknown; theme?: unknown };
  const patch: { timezone?: string; theme?: string } = {};

  if (body.timezone !== undefined) {
    if (!isValidTimezone(body.timezone)) {
      return NextResponse.json({ error: 'invalid timezone' }, { status: 400 });
    }
    patch.timezone = body.timezone;
  }
  if (body.theme !== undefined) {
    if (!isValidTheme(body.theme)) {
      return NextResponse.json({ error: 'invalid theme' }, { status: 400 });
    }
    patch.theme = body.theme;
  }

  const next = setAccountPrefs(getPlatformDb(), userId, patch);
  const res = NextResponse.json(next);

  // Mirror the theme to a cookie so the shell can resolve it before first paint
  // without a DB round-trip (ACC-08; account.md open question 4).
  if (patch.theme) {
    res.cookies.set('sv-theme', patch.theme, {
      path: '/',
      maxAge: 60 * 60 * 24 * 365,
      sameSite: 'lax',
    });
  }
  return res;
}
