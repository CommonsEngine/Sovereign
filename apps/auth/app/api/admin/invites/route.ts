import { NextResponse } from 'next/server';
import { checkAdminKey } from '@/src/admin-guard';
import { authRun } from '@/src/db';

interface InviteBody {
  email: string;
  expiresInDays?: number;
}

export async function POST(request: Request): Promise<Response> {
  const denied = checkAdminKey(request);
  if (denied) return denied;

  const body = (await request.json()) as InviteBody;
  if (!body.email) {
    return NextResponse.json({ error: 'email is required' }, { status: 400 });
  }

  const token = crypto.randomUUID();
  const createdAt = Math.floor(Date.now() / 1000);
  const expiresAt = body.expiresInDays != null ? createdAt + body.expiresInDays * 86400 : null;

  await authRun('INSERT INTO invites (token, email, created_at, expires_at) VALUES (?, ?, ?, ?)', [
    token,
    body.email,
    createdAt,
    expiresAt,
  ]);

  return NextResponse.json({ token, email: body.email }, { status: 201 });
}
