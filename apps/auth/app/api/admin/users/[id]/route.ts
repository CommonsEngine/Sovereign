import { NextResponse } from 'next/server';
import { checkAdminKey } from '@/src/admin-guard';
import { getDb } from '@/src/db';

interface PatchBody {
  role?: string;
  active?: boolean;
}

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
): Promise<Response> {
  const denied = checkAdminKey(request);
  if (denied) return denied;

  const { id } = await params;
  const body = (await request.json()) as PatchBody;

  const db = getDb();

  if ('role' in body) {
    db.prepare('UPDATE user SET role = ?, updatedAt = ? WHERE id = ?').run(
      body.role,
      Math.floor(Date.now() / 1000),
      id,
    );
  }

  if ('active' in body) {
    db.prepare('UPDATE user SET active = ?, updatedAt = ? WHERE id = ?').run(
      body.active ? 1 : 0,
      Math.floor(Date.now() / 1000),
      id,
    );
  }

  const updated = db
    .prepare('SELECT id, email, name, role, active, createdAt FROM user WHERE id = ?')
    .get(id) as {
    id: string;
    email: string;
    name: string | null;
    role: string;
    active: number | null;
    createdAt: number;
  } | undefined;

  if (!updated) {
    return NextResponse.json({ error: 'not found' }, { status: 404 });
  }

  return NextResponse.json({
    id: updated.id,
    email: updated.email,
    name: updated.name,
    role: updated.role,
    active: updated.active !== 0,
    createdAt: updated.createdAt,
  });
}
