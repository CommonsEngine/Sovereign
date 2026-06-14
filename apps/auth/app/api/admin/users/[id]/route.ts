import { NextResponse } from 'next/server';
import { checkAdminKey } from '@/src/admin-guard';
import { authGet, authRun } from '@/src/db';

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

  const now = new Date().toISOString(); // better-auth stores dates as ISO/timestamp

  // `user` is a reserved word in Postgres and the date columns are camelCase, so
  // both are quoted to keep the SQL portable. `active` is bound as a boolean and
  // mapped to 0/1 for SQLite by the query layer.
  if ('role' in body) {
    await authRun('UPDATE "user" SET role = ?, "updatedAt" = ? WHERE id = ?', [body.role, now, id]);
  }

  if ('active' in body) {
    await authRun('UPDATE "user" SET active = ?, "updatedAt" = ? WHERE id = ?', [
      body.active,
      now,
      id,
    ]);
  }

  const updated = await authGet<{
    id: string;
    email: string;
    name: string | null;
    role: string;
    active: number | boolean | null;
    createdAt: string | Date;
  }>('SELECT id, email, name, role, active, "createdAt" FROM "user" WHERE id = ?', [id]);

  if (!updated) {
    return NextResponse.json({ error: 'not found' }, { status: 404 });
  }

  return NextResponse.json({
    id: updated.id,
    email: updated.email,
    name: updated.name,
    role: updated.role,
    active: updated.active !== 0 && updated.active !== false,
    createdAt:
      updated.createdAt instanceof Date ? updated.createdAt.toISOString() : updated.createdAt,
  });
}
