import { toNextJsHandler } from 'better-auth/next-js';
import { getAuth } from '@/src/auth';

// better-auth's catch-all handler. getAuth() is lazy/memoised, so the
// AUTH_SECRET check fires on the first request, not at build time.
export async function GET(request: Request): Promise<Response> {
  return toNextJsHandler(getAuth()).GET(request);
}

export async function POST(request: Request): Promise<Response> {
  return toNextJsHandler(getAuth()).POST(request);
}
