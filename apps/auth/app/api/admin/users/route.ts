import { NextResponse } from 'next/server';
import { checkAdminKey } from '@/src/admin-guard';
import { getDb } from '@/src/db';

interface AuthUser {
  id: string;
  email: string;
  name: string | null;
  role: string;
  active: number | null; // SQLite boolean: 0 | 1 | NULL (NULL = active, same as default)
  createdAt: number;
}

export async function GET(request: Request): Promise<Response> {
  const denied = checkAdminKey(request);
  if (denied) return denied;

  const db = getDb();
  const rows = db
    .prepare('SELECT id, email, name, role, active, createdAt FROM user ORDER BY createdAt ASC')
    .all() as AuthUser[];

  return NextResponse.json(
    rows.map((u) => ({
      id: u.id,
      email: u.email,
      name: u.name,
      role: u.role,
      active: u.active !== 0,
      createdAt: u.createdAt,
    })),
  );
}
