export { createClient, findWorkspaceRoot, resolveSqlitePath, type DbConfig } from './client';
export {
  PLATFORM_BOOTSTRAP_SQL,
  PLATFORM_SETTINGS_BOOTSTRAP_SQL,
  PLUGIN_STATUS_BOOTSTRAP_SQL,
  TENANTS_BOOTSTRAP_SQL,
} from './bootstrap';
export {
  DEFAULT_ROOT_PLUGIN_ID,
  DEFAULT_TENANT_ID,
  bootstrapPlatformDb,
  getDefaultTenant,
  getPlatformDb,
  getPlatformSetting,
  setPlatformSetting,
  setTenantName,
  type PlatformDb,
} from './platform-db';
export { resolveDialect, type Dialect, type ResolvedDialect } from './dialect';
export { runMigrations } from './migrate';

export * as schema from './schema/sqlite';
export type {
  Tenant,
  NewTenant,
  User,
  NewUser,
  Session,
  NewSession,
  PluginStatus,
  NewPluginStatus,
  PlatformSetting,
  NewPlatformSetting,
} from './schema/sqlite/platform';
