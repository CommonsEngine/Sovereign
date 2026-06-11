import { runAuthMigrations } from '../src/migrate';

await runAuthMigrations();
console.log('[auth] migrations applied');
