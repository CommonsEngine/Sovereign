export { createClient, findWorkspaceRoot, resolveSqlitePath, type DbConfig } from './client';
export { platformBootstrapStatements } from './bootstrap';
export {
  DEFAULT_ROOT_PLUGIN_ID,
  DEFAULT_TENANT_ID,
  bootstrapPlatformDb,
  getAccountPrefs,
  getDefaultTenant,
  getPlatformDb,
  getPlatformSetting,
  listDisabledPluginIds,
  listPluginStatus,
  pingDb,
  setAccountPrefs,
  setPlatformSetting,
  setPluginEnabled,
  setTenantName,
  type AccountPrefsValue,
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
  AccountPrefs,
  NewAccountPrefs,
} from './schema/sqlite/platform';
