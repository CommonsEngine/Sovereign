/**
 * Console database schema.
 *
 * The Console plugin owns no tables in v1 — it reads and writes existing
 * platform tables (users, tenants, platform_settings, plugin_status) through
 * the SDK. This file marks the plugin's `db/` directory as present and ready
 * for any future console-owned tables.
 */
export {};
