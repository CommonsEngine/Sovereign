import { NextResponse } from 'next/server';
import { checkAdminKey } from '@/src/admin-guard';
import { getEnv } from '@/src/env';
import { readInviteOnlySetting, resolveInviteOnly, writeInviteOnlySetting } from '@/src/settings';

export async function GET(request: Request): Promise<Response> {
  const denied = checkAdminKey(request);
  if (denied) return denied;

  const inviteOnly = resolveInviteOnly(await readInviteOnlySetting(), getEnv().inviteOnly);
  return NextResponse.json({ inviteOnly });
}

export async function PATCH(request: Request): Promise<Response> {
  const denied = checkAdminKey(request);
  if (denied) return denied;

  const body = (await request.json()) as { inviteOnly?: boolean };
  if (typeof body.inviteOnly !== 'boolean') {
    return NextResponse.json({ error: 'inviteOnly (boolean) is required' }, { status: 400 });
  }

  await writeInviteOnlySetting(body.inviteOnly);
  return NextResponse.json({ inviteOnly: body.inviteOnly });
}
