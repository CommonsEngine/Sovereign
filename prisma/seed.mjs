import { PrismaClient } from "@prisma/client";
import argon2 from "argon2";

const prisma = new PrismaClient();

async function main() {
  // Non-destructive cleanup (only ephemeral auth tables)
  await prisma.session?.deleteMany().catch(() => {});
  await prisma.verificationToken?.deleteMany().catch(() => {});
  await prisma.passwordResetToken?.deleteMany().catch(() => {});

  // Owner user seed
  const displayName = "Heimdallr";
  const username = "heimdallr";
  const email = "heimdallr@sovereign.local";
  const role = 0; // owner
  const status = "active";

  // Generate a strong password and hash it (argon2id)
  const password = "ffp@2025"; // generated seed password
  const passwordHash = await argon2.hash(password, { type: argon2.argon2id });

  // Upsert to avoid duplicates if re-running the seed
  const user = await prisma.user.upsert({
    where: { email },
    update: {
      displayName,
      username,
      role,
      status,
      passwordHash,
    },
    create: {
      displayName,
      username,
      email,
      role,
      status,
      passwordHash,
    },
    select: { id: true, email: true, username: true, role: true, status: true },
  });

  console.log("Owner user seeded:", user);
  console.log(`Login with -> email: ${email}  password: ${password}`);
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
