/**
 * Account database schema.
 *
 * The Account plugin owns the `account_prefs` table (per-user timezone +
 * theme). Until `sdk.db` lands (Task 0.5.05), the authoritative Drizzle
 * definition lives in `packages/db` (the shared platform schema) and the
 * runtime reads/writes it on the plugin's behalf via `/api/account/prefs`.
 * This file marks the plugin's `db/` directory and will hold the plugin-owned
 * schema once `sdk.db` exposes a scoped client.
 */
export {};
