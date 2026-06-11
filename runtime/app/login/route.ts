import { NextResponse } from 'next/server';

const AUTH_URL = process.env.SOVEREIGN_AUTH_URL ?? 'http://localhost:3001';

// The login/registration UI lives in apps/auth (SRS §3.3). Redirect there; the
// auth server redirects back to the runtime after a successful sign-in.
export function GET(): Response {
  return NextResponse.redirect(`${AUTH_URL}/login`);
}
