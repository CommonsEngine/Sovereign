import { NextResponse } from 'next/server';
import { checkAdminKey } from '@/src/admin-guard';
import { getDb } from '@/src/db';
import { buildMemberList, type AuthUserRow, type PendingInviteRow } from '@/src/member-list';

export async function GET(request: Request): Promise<Response> {
  const denied = checkAdminKey(request);
  if (denied) return denied;

  const db = getDb();

  const users = db
    .prepare('SELECT id, email, name, role, active, createdAt FROM user ORDER BY createdAt ASC')
    .all() as AuthUserRow[];

  const now = Math.floor(Date.now() / 1000);

  // Pending invites only: not consumed, not expired. Ascending order so the
  // merge's last-write-wins dedup keeps the most recent invite per email.
  const invites = db
    .prepare(
      `SELECT email, created_at, expires_at FROM invites
       WHERE consumed_at IS NULL
         AND (expires_at IS NULL OR expires_at > ?)
       ORDER BY created_at ASC`,
    )
    .all(now) as PendingInviteRow[];

  return NextResponse.json(buildMemberList(users, invites));
}
