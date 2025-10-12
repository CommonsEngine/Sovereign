 
import { PrismaClient } from "@prisma/client";

import { seedRBAC, seedOwnerUser, seedTestUsers } from "./scripts/rbac.mjs";
import { seedAppSettings } from "./scripts/config.mjs";

const prisma = new PrismaClient();

async function main() {
  // Clean up ephemeral tables
  // TODO: Consider using prisma migrate reset --force
  await prisma.session.deleteMany().catch(() => {});
  await prisma.verificationToken.deleteMany().catch(() => {});
  await prisma.passwordResetToken.deleteMany().catch(() => {});

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
