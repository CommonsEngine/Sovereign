export { createClient, type DbConfig } from './client';
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
} from './schema/sqlite/platform';
