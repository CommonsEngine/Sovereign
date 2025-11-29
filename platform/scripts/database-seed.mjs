import "dotenv/config";

import { PrismaClient } from "@prisma/client";

import seedRBACData from "./database-seed-rbac-data.mjs";
import seedTestUsers from "./database-seed-test-users.mjs";
import seedAppSettings from "./database-seed-app-settings.mjs";

const prisma = new PrismaClient();

const resolvedEnv =
  (process.env.NODE_ENV && process.env.NODE_ENV.trim()) ||
  (process.env.APP_ENV && process.env.APP_ENV.trim()) ||
  "development";
const isProd = resolvedEnv === "production";
const allowDestructiveReset = process.env.FORCE_DB_RESET === "true";

// Helper to clear all data from Sqlite (for dev/testing purposes)
async function clearSqlite() {
  const tables =
    await prisma.$queryRaw`SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%'`;
  const names = tables.map((r) => r.name).filter(Boolean);
  await prisma.$executeRawUnsafe("PRAGMA foreign_keys = OFF;");
  for (const t of names) {
    // skip migrations table if you want to preserve it (optional)
    if (t === "prisma_migrations") continue;
    await prisma.$executeRawUnsafe(`DELETE FROM "${t}";`);
  }
  await prisma.$executeRawUnsafe("PRAGMA foreign_keys = ON;");
  await prisma.$executeRawUnsafe("VACUUM;");
}

async function main() {
  if (!isProd && allowDestructiveReset) {
    console.warn("[seed] FORCE_DB_RESET=true → clearing database before seeding");
    await clearSqlite();
  } else if (allowDestructiveReset && isProd) {
    console.warn("[seed] FORCE_DB_RESET ignored in production; skipping destructive reset");
  } else {
    console.log("[seed] Skipping destructive reset (safe mode)");
  }

  await seedRBACData(prisma);
  await seedTestUsers(prisma);
  await seedAppSettings(prisma);
}

(async () => {
  try {
    await main();
  } catch (e) {
    console.error("✗ Seed failed:", e);
    process.exit(1);
  } finally {
    await prisma.$disconnect();
  }
})();
