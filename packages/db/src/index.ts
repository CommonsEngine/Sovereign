export { createClient, resolveSqlitePath, type DbConfig } from './client';
export { PLUGIN_STATUS_BOOTSTRAP_SQL } from './bootstrap';
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
} from './schema/sqlite/platform';
