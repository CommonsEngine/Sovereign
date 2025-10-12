import { PrismaClient } from "@prisma/client";

import { seedRBAC, seedOwnerUser, seedTestUsers } from "./scripts/rbac.mjs";
import { seedAppSettings } from "./scripts/config.mjs";

const prisma = new PrismaClient();

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

  await seedRBAC(prisma);
  await seedOwnerUser(prisma);
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
