import { sql } from 'drizzle-orm';
import { createClient, PLUGIN_STATUS_BOOTSTRAP_SQL } from '@sovereignfs/db';

let _db: ReturnType<typeof createClient> | null = null;

/**
 * Returns the platform Drizzle client, initialising it once per process.
 *
 * `plugin_status` (and future platform tables) are bootstrapped here with
 * CREATE TABLE IF NOT EXISTS because drizzle-kit is not in this repo until
 * Task 0.5.03 (Postgres + proper migrations). The bootstrap is intentionally
 * minimal — no default rows; absence of a row means "enabled".
 */
export function getPlatformDb(): ReturnType<typeof createClient> {
  if (_db) return _db;

  _db = createClient();
  _db.run(sql.raw(PLUGIN_STATUS_BOOTSTRAP_SQL));

  return _db;
}
