export type Dialect = 'sqlite' | 'postgres';

export interface ResolvedDialect {
  dialect: Dialect;
  url: string;
}

/**
 * Default connection when nothing is configured: a local SQLite file. This is a
 * convenience default for zero-config self-hosting, not a secret — secrets such
 * as AUTH_SECRET have no defaults and throw when unset (see SRS NFR).
 */
const DEFAULT_SQLITE_URL = 'file:./data/sovereign.db';

function isPostgresUrl(url: string): boolean {
  return url.startsWith('postgres://') || url.startsWith('postgresql://');
}

/**
 * Resolve the database dialect and connection URL from the environment.
 *
 * - `DB_DIALECT` (`sqlite` | `postgres`) is authoritative when set.
 * - Otherwise the dialect is inferred from `DATABASE_URL` (a `postgres(ql)://`
 *   URL → postgres), defaulting to SQLite.
 */
export function resolveDialect(env: NodeJS.ProcessEnv = process.env): ResolvedDialect {
  const explicit = env.DB_DIALECT?.toLowerCase();
  const url = env.DATABASE_URL ?? DEFAULT_SQLITE_URL;

  if (explicit === 'sqlite' || explicit === 'postgres') {
    return { dialect: explicit, url };
  }
  if (explicit !== undefined && explicit.length > 0) {
    throw new Error(`Invalid DB_DIALECT "${explicit}". Expected "sqlite" or "postgres".`);
  }

  return { dialect: isPostgresUrl(url) ? 'postgres' : 'sqlite', url };
}
