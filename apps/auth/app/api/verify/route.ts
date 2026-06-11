import { NextResponse } from 'next/server';
import { getAuth } from '@/src/auth';

/**
 * Session verification for the runtime. Returns the authenticated user
 * (id, email, role) or 401. Consumed by the runtime middleware (SRS AUTH-05/06).
 */
export async function GET(request: Request): Promise<Response> {
  const session = await getAuth().api.getSession({ headers: request.headers });
  if (!session) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  }
  const user = session.user as { id: string; email: string; role?: string };
  return NextResponse.json({
    user: { id: user.id, email: user.email, role: user.role ?? 'platform:user' },
  });
}
