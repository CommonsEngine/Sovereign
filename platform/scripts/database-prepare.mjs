import "dotenv/config";
import { execSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";

const resolvedEnv =
  (process.env.NODE_ENV && process.env.NODE_ENV.trim()) ||
  (process.env.APP_ENV && process.env.APP_ENV.trim()) ||
  "development";
const isProd = resolvedEnv === "production";
const schemaArg = "--schema prisma/schema.prisma";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const composeScript = path.resolve(__dirname, "../../tools/database-prisma-compose.mjs");
const composeCmd = `node ${JSON.stringify(composeScript)}`;
const seedPluginsScript = path.resolve(__dirname, "../../tools/database-seed-plugins.mjs");
const seedPluginsCmd = `node ${JSON.stringify(seedPluginsScript)}`;

function run(cmd) {
  console.log(`[prepare:db] ${cmd}`);
  execSync(cmd, { stdio: "inherit" });
}

try {
  console.log(`[prepare:db] Using NODE_ENV=${resolvedEnv}`);
  // 0) Ensure the composed schema is up-to-date
  run(composeCmd);

  // 1) Always generate client
  run(`prisma generate ${schemaArg}`);

  if (isProd) {
    // 2a) Production: apply committed migrations (first run or later)
    run(`prisma migrate deploy ${schemaArg}`);
  } else {
    // 2b) Development: push the current schema (no migration history needed)
    //    Optional override to force push even in prod (use sparingly):
    //    if (process.env.FORCE_DB_PUSH === "true") { ... }
    run(`prisma db push ${schemaArg}`);
  }

  // 3) Ensure plugin metadata/capabilities are seeded
  run(seedPluginsCmd);

  console.log(`[prepare:db] ✓ Done (${isProd ? "production" : "development"} path)`);
} catch (err) {
  console.error("[prepare:db] ✗ Failed:", err?.message || err);
  process.exit(1);
}
