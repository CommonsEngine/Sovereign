/**
 * install-plugins — stub.
 *
 * Reads `sovereign.plugins.json` at the repo root and (eventually) clones the
 * declared `sovereign`/`community` plugins into `plugins/[id]/`, then runs the
 * generate step to wire them into the runtime.
 *
 * This is a stub. The full implementation lands in Task 0.5.00. For now it only
 * reports whether the config exists and that the work is not yet implemented.
 *
 * See: docs/sovereign-implementation-tasks.md — Task 0.5.00
 */
import { existsSync } from 'node:fs';
import { resolve } from 'node:path';

const CONFIG_PATH = resolve(process.cwd(), 'sovereign.plugins.json');

function main(): void {
  if (existsSync(CONFIG_PATH)) {
    console.log(`[install-plugins] Found config at ${CONFIG_PATH}`);
  } else {
    console.log('[install-plugins] No sovereign.plugins.json found at repo root.');
  }
  console.log('[install-plugins] not yet implemented (see Task 0.5.00).');
}

main();
