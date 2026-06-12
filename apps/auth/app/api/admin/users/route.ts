import { NextResponse } from 'next/server';
import { checkAdminKey } from '@/src/admin-guard';
import { getDb } from '@/src/db';

interface AuthUser {
  id: string;
  email: string;
  name: string | null;
  role: string;
  active: number | null; // SQLite boolean: 0 | 1 | NULL (NULL = active, same as default)
  createdAt: string; // better-auth stores dates as ISO 8601 strings in SQLite
}

interface PendingInvite {
  email: string;
  created_at: number; // Unix timestamp (seconds)
  expires_at: number | null;
}

export async function GET(request: Request): Promise<Response> {
  const denied = checkAdminKey(request);
  if (denied) return denied;

  const db = getDb();

  const users = db
    .prepare('SELECT id, email, name, role, active, createdAt FROM user ORDER BY createdAt ASC')
    .all() as AuthUser[];

  const registeredEmails = new Set(users.map((u) => u.email));
  const now = Math.floor(Date.now() / 1000);

  // Pending invites: not consumed, not expired, and the invitee hasn't registered yet.
  const pendingInvites = (
    db
      .prepare(
        `SELECT email, created_at, expires_at FROM invites
         WHERE consumed_at IS NULL
           AND (expires_at IS NULL OR expires_at > ?)
         ORDER BY created_at ASC`,
      )
      .all(now) as PendingInvite[]
  ).filter((inv) => !registeredEmails.has(inv.email));

  const userRows = users.map((u) => ({
    id: u.id,
    email: u.email,
    name: u.name,
    role: u.role,
    status: u.active === 0 ? 'deactivated' : 'active',
    createdAt: u.createdAt,
    expiresAt: null,
  }));

  const inviteRows = pendingInvites.map((inv) => ({
    id: null,
    email: inv.email,
    name: null,
    role: null,
    status: 'invited',
    createdAt: new Date(inv.created_at * 1000).toISOString(),
    expiresAt: inv.expires_at ? new Date(inv.expires_at * 1000).toISOString() : null,
  }));

  return NextResponse.json([...userRows, ...inviteRows]);
}
