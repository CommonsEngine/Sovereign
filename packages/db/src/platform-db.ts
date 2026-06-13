import { and, eq } from 'drizzle-orm';
import { sql } from 'drizzle-orm';
import { PLATFORM_BOOTSTRAP_SQL } from './bootstrap';
import { createClient } from './client';
import * as schema from './schema/sqlite';

export type PlatformDb = ReturnType<typeof createClient>;

/** v1 is single-tenant; every tenant-scoped row uses this id (SRS §3.1). */
export const DEFAULT_TENANT_ID = 'default';

/** Default root plugin (SRS PLT-14). */
export const DEFAULT_ROOT_PLUGIN_ID = 'fs.sovereign.launcher';

const DEFAULT_TENANT_NAME = 'Sovereign';

/**
 * Apply the interim DDL bootstrap and seed rows to a client. Idempotent —
 * CREATE TABLE IF NOT EXISTS plus conflict-ignoring inserts. Exported
 * separately from the singleton so tests can run it against :memory:.
 */
export function bootstrapPlatformDb(db: PlatformDb): void {
  for (const statement of PLATFORM_BOOTSTRAP_SQL) {
    db.run(sql.raw(statement));
  }

  const now = Math.floor(Date.now() / 1000);

  db.insert(schema.tenants)
    .values({ id: DEFAULT_TENANT_ID, name: DEFAULT_TENANT_NAME, createdAt: now, updatedAt: now })
    .onConflictDoNothing()
    .run();

  db.insert(schema.platformSettings)
    .values({
      key: 'root_plugin_id',
      tenantId: DEFAULT_TENANT_ID,
      value: DEFAULT_ROOT_PLUGIN_ID,
      updatedAt: now,
    })
    .onConflictDoNothing()
    .run();
}

let _db: PlatformDb | null = null;

/**
 * The platform database, initialised once per process from the environment
 * (DATABASE_URL / DB_DIALECT) with tables bootstrapped and seed rows present.
 */
export function getPlatformDb(): PlatformDb {
  if (_db) return _db;
  _db = createClient();
  bootstrapPlatformDb(_db);
  return _db;
}

/** Read a platform setting for the default tenant. Returns null when unset. */
export function getPlatformSetting(db: PlatformDb, key: string): string | null {
  const row = db
    .select({ value: schema.platformSettings.value })
    .from(schema.platformSettings)
    .where(
      and(
        eq(schema.platformSettings.key, key),
        eq(schema.platformSettings.tenantId, DEFAULT_TENANT_ID),
      ),
    )
    .get();
  return row?.value ?? null;
}

/** Upsert a platform setting for the default tenant. */
export function setPlatformSetting(db: PlatformDb, key: string, value: string): void {
  const now = Math.floor(Date.now() / 1000);
  db.insert(schema.platformSettings)
    .values({ key, tenantId: DEFAULT_TENANT_ID, value, updatedAt: now })
    .onConflictDoUpdate({
      target: [schema.platformSettings.key, schema.platformSettings.tenantId],
      set: { value, updatedAt: now },
    })
    .run();
}

/** The default tenant row. Always present after bootstrap. */
export function getDefaultTenant(db: PlatformDb): schema.Tenant {
  const tenant = db
    .select()
    .from(schema.tenants)
    .where(eq(schema.tenants.id, DEFAULT_TENANT_ID))
    .get();
  if (!tenant) {
    throw new Error('Default tenant missing — was bootstrapPlatformDb() run?');
  }
  return tenant;
}

/** Rename the default tenant (CON-08). */
export function setTenantName(db: PlatformDb, name: string): void {
  const now = Math.floor(Date.now() / 1000);
  db.update(schema.tenants)
    .set({ name, updatedAt: now })
    .where(eq(schema.tenants.id, DEFAULT_TENANT_ID))
    .run();
}
