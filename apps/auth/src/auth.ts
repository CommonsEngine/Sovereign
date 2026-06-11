import { betterAuth, type BetterAuthOptions } from 'better-auth';
import { APIError } from 'better-auth/api';
import { nextCookies } from 'better-auth/next-js';
import { getDb } from './db';
import { getEnv } from './env';

function buildOptions(): BetterAuthOptions {
  const env = getEnv();
  const db = getDb();

  return {
    secret: env.secret,
    baseURL: env.baseUrl,
    database: db,
    emailAndPassword: {
      enabled: true,
      autoSignIn: true,
    },
    user: {
      additionalFields: {
        // Platform role. Not user-settable; assigned by the create hook below.
        role: {
          type: 'string',
          required: false,
          defaultValue: 'platform:user',
          input: false,
        },
      },
    },
    databaseHooks: {
      user: {
        create: {
          before: async (user) => {
            const isFirst =
              (db.prepare('SELECT COUNT(*) AS c FROM user').get() as { c: number }).c === 0;

            // Invite-only gate (first user bootstraps and is exempt).
            if (!isFirst && env.inviteOnly) {
              const now = Math.floor(Date.now() / 1000);
              const invite = db
                .prepare(
                  'SELECT token FROM invites WHERE email = ? AND consumed_at IS NULL AND (expires_at IS NULL OR expires_at > ?)',
                )
                .get(user.email, now);
              if (!invite) {
                throw new APIError('FORBIDDEN', {
                  message: 'Registration is invite-only; no valid invite was found for this email.',
                });
              }
              db.prepare('UPDATE invites SET consumed_at = ? WHERE email = ?').run(now, user.email);
            }

            // First user becomes the platform admin.
            return { data: { ...user, role: isFirst ? 'platform:admin' : 'platform:user' } };
          },
        },
      },
    },
    plugins: [nextCookies()],
  };
}

let options: BetterAuthOptions | undefined;
let instance: ReturnType<typeof betterAuth> | undefined;

/** The resolved better-auth options (also used by the migration runner). */
export function getAuthOptions(): BetterAuthOptions {
  options ??= buildOptions();
  return options;
}

/** The better-auth instance, created lazily on first use (runtime, not build). */
export function getAuth(): ReturnType<typeof betterAuth> {
  instance ??= betterAuth(getAuthOptions());
  return instance;
}
