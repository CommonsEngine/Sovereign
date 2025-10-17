import "dotenv/config";

import { PrismaClient } from "@prisma/client";

import seedRBACData from "./scripts/seed-rbac-data.mjs";
import seedTestUsers from "./scripts/seed-test-users.mjs";
import seedAppSettings from "./scripts/seed-app-settings.mjs";

const prisma = new PrismaClient();

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
  await clearSqlite();

  await seedRBACData(prisma);
  await seedTestUsers(prisma);
  await seedAppSettings(prisma);

  if (process.env.NODE_ENV === "development") {
    await seedTestUsers(prisma);
  }
}

(async () => {
  try {
    await main();
  } catch (e) {
    console.error("Seed failed:", e);
    process.exit(1);
  } finally {
    await prisma.$disconnect();
  }
})();
