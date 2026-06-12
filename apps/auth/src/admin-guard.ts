import { NextResponse } from 'next/server';
import { getEnv } from './env';

/** Returns a 403 response if the request lacks a valid admin bearer token. */
export function checkAdminKey(request: Request): NextResponse | null {
  const auth = request.headers.get('authorization') ?? '';
  const expected = `Bearer ${getEnv().adminKey}`;
  if (auth !== expected) {
    return NextResponse.json({ error: 'forbidden' }, { status: 403 });
  }
  return null;
}
