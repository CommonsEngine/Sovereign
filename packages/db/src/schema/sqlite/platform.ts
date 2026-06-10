import { integer, sqliteTable, text } from 'drizzle-orm/sqlite-core';

/**
 * Platform schema (SQLite dialect).
 *
 * Conventions (shared with plugin schemas):
 * - IDs are ULIDs stored as `text`.
 * - Timestamps are Unix epoch seconds stored as `integer`.
 * - Booleans are stored as `integer` 0/1 (Drizzle `mode: 'boolean'`).
 * - `tenant_id` is present on all user-scoped tables from day one for future
 *   multi-tenancy, even though v1 is single-tenant (SRS §3.1).
 *
 * Defaults are limited to dialect-portable literals — no SQLite-specific SQL
 * (e.g. `unixepoch()`), so the schema stays dialect-agnostic. Callers supply
 * timestamps.
 */

export const tenants = sqliteTable('tenants', {
  id: text('id').primaryKey(),
  name: text('name').notNull(),
  createdAt: integer('created_at').notNull(),
  updatedAt: integer('updated_at').notNull(),
});

export const users = sqliteTable('users', {
  id: text('id').primaryKey(),
  tenantId: text('tenant_id')
    .notNull()
    .references(() => tenants.id),
  email: text('email').notNull().unique(),
  emailVerified: integer('email_verified', { mode: 'boolean' }).notNull().default(false),
  name: text('name'),
  image: text('image'),
  role: text('role').notNull().default('platform:user'),
  createdAt: integer('created_at').notNull(),
  updatedAt: integer('updated_at').notNull(),
});

export const sessions = sqliteTable('sessions', {
  id: text('id').primaryKey(),
  userId: text('user_id')
    .notNull()
    .references(() => users.id),
  token: text('token').notNull().unique(),
  expiresAt: integer('expires_at').notNull(),
  ipAddress: text('ip_address'),
  userAgent: text('user_agent'),
  createdAt: integer('created_at').notNull(),
  updatedAt: integer('updated_at').notNull(),
});

export type Tenant = typeof tenants.$inferSelect;
export type NewTenant = typeof tenants.$inferInsert;
export type User = typeof users.$inferSelect;
export type NewUser = typeof users.$inferInsert;
export type Session = typeof sessions.$inferSelect;
export type NewSession = typeof sessions.$inferInsert;
