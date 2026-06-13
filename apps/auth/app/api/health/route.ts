import { NextResponse } from 'next/server';

/**
 * Liveness probe for the runtime's health dashboard (CON-09). Exposes no
 * sensitive data; reachable without authentication. The auth server is
 * internal-only in Docker deployments.
 */
export function GET(): Response {
  return NextResponse.json({ status: 'ok' });
}
