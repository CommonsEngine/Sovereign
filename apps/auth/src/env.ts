function required(name: string): string {
  const value = process.env[name];
  if (value === undefined || value.length === 0) {
    throw new Error(`Missing required environment variable: ${name}`);
  }
  return value;
}

export interface AuthEnv {
  /** Shared signing secret. No default — the server refuses to start without it. */
  secret: string;
  /** Auth database location. Defaults to a local SQLite file. */
  databaseUrl: string;
  /** When true, registration requires a valid invite (first user exempt). */
  inviteOnly: boolean;
  /** Public base URL of the auth server. */
  baseUrl: string;
}

let cached: AuthEnv | undefined;

/**
 * Resolve and validate auth environment configuration. Lazy so that importing
 * auth modules (e.g. during `next build`) does not throw — the AUTH_SECRET check
 * fires when the server first handles a request.
 */
export function getEnv(): AuthEnv {
  cached ??= {
    secret: required('AUTH_SECRET'),
    databaseUrl: process.env.AUTH_DATABASE_URL ?? 'file:./data/auth.db',
    inviteOnly: process.env.AUTH_INVITE_ONLY === 'true',
    baseUrl: process.env.AUTH_BASE_URL ?? 'http://localhost:3001',
  };
  return cached;
}
