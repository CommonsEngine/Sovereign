import { mkdirSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { NextResponse } from 'next/server';
import { validateAvatar } from '@/src/account';
import { avatarsDir } from '@/src/avatars';

const AUTH_URL = process.env.SOVEREIGN_AUTH_URL ?? 'http://localhost:3001';

/**
 * Upload/replace the current user's avatar (ACC-03). Session-gated by the
 * middleware. Stores the image on disk at `data/avatars/<user_id>.<ext>` and
 * writes the servable URL to the user record's `image` field via better-auth
 * (forwarding the session cookie). Returns the new URL.
 */
export async function POST(request: Request): Promise<Response> {
  const userId = request.headers.get('x-sovereign-user-id');
  if (!userId) return NextResponse.json({ error: 'unauthenticated' }, { status: 401 });

  const form = await request.formData();
  const file = form.get('avatar');
  if (!(file instanceof File)) {
    return NextResponse.json({ error: 'no file provided' }, { status: 400 });
  }

  const result = validateAvatar(file.type, file.size);
  if (!result.ok) {
    return NextResponse.json({ error: result.error }, { status: 400 });
  }

  const dir = avatarsDir();
  mkdirSync(dir, { recursive: true });
  // Replace any prior avatar for this user (extension may differ).
  for (const entry of readdirSync(dir)) {
    if (entry === userId || entry.startsWith(`${userId}.`)) {
      rmSync(join(dir, entry), { force: true });
    }
  }
  const bytes = Buffer.from(await file.arrayBuffer());
  writeFileSync(join(dir, `${userId}.${result.ext}`), bytes);

  // Cache-bust so the shell/profile pick up the replacement immediately.
  const url = `/api/account/avatar/${userId}?v=${String(Date.now())}`;

  const authRes = await fetch(`${AUTH_URL}/api/auth/update-user`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      cookie: request.headers.get('cookie') ?? '',
      // better-auth enforces a CSRF Origin check; the auth server's own base
      // URL is its default trusted origin for these server-to-server calls.
      origin: AUTH_URL,
    },
    body: JSON.stringify({ image: url }),
  });
  if (!authRes.ok) {
    return NextResponse.json({ error: 'failed to update profile image' }, { status: 502 });
  }

  return NextResponse.json({ url });
}
