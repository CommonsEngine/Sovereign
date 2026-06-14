import { readFileSync } from 'node:fs';
import { NextResponse } from 'next/server';
import { avatarContentType, findAvatarFile } from '@/src/avatars';

interface RouteParams {
  params: Promise<{ userId: string }>;
}

/**
 * Serve a user's avatar image (ACC-03). Session-gated by the middleware (the
 * browser sends the session cookie with the `<img>` request). Returns 404 when
 * the user has no stored avatar — the UI falls back to a monogram.
 */
export async function GET(_request: Request, { params }: RouteParams): Promise<Response> {
  const { userId } = await params;
  const path = findAvatarFile(userId);
  if (!path) return new NextResponse('Not Found', { status: 404 });

  const body = readFileSync(path);
  return new NextResponse(body, {
    headers: {
      'Content-Type': avatarContentType(path),
      // Per-user avatars change rarely; the upload URL is cache-busted with ?v=.
      'Cache-Control': 'private, max-age=3600',
    },
  });
}
