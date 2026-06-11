/**
 * Runs once on server startup (not during build). Applies better-auth's schema
 * migrations so `pnpm dev` works with no separate migrate step. Guarded to the
 * Node.js runtime — migrations use better-sqlite3, which the edge runtime lacks.
 */
export async function register(): Promise<void> {
  if (process.env.NEXT_RUNTIME === 'nodejs') {
    const { runAuthMigrations } = await import('./src/migrate');
    await runAuthMigrations();
  }
}
