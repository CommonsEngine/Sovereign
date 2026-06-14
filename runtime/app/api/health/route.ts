import { NextResponse } from 'next/server';

/**
 * Liveness probe for the runtime container's Docker HEALTHCHECK. Exposes no
 * sensitive data and is reachable without authentication (excluded from the
 * middleware session gate). For the richer admin health report (DB, auth
 * reachability, uptime) see the admin-key-gated `/api/admin/health` (CON-09).
 */
export function GET(): Response {
  return NextResponse.json({ status: 'ok' });
}
