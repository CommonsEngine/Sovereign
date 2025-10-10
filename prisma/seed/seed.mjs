/* eslint-disable import/order */
import { PrismaClient } from "@prisma/client";
import argon2 from "argon2";
import fs from "fs";
import path from "path";

const prisma = new PrismaClient();

const rbacPath = path.resolve(process.cwd(), "prisma/seed/rbac.json");
const rbac = JSON.parse(fs.readFileSync(rbacPath, "utf8"));

async function seedRBAC() {
  // Seed capabilities
  for (const cap of rbac.capabilities_catalog) {
    await prisma.userCapability.upsert({
      where: { key: cap.key },
      update: { description: cap.description },
      create: { key: cap.key, description: cap.description },
    });
  }

  // Seed roles
  for (const role of rbac.roles) {
    await prisma.userRole.upsert({
      where: { key: role.key },
      update: {
        label: role.label,
        level: role.level,
        scope: role.scope,
        description: role.description,
      },
      create: {
        id: role.id,
        key: role.key,
        label: role.label,
        level: role.level,
        scope: role.scope,
        description: role.description,
      },
    });

    // Seed role-capabilities
    for (const [capKey, value] of Object.entries(role.capabilities)) {
      await prisma.userRoleCapability.upsert({
        where: {
          roleId_capabilityKey: {
            roleId: role.id,
            capabilityKey: capKey,
          },
        },
        update: { value },
        create: {
          roleId: role.id,
          capabilityKey: capKey,
          value,
        },
      });
    }
  }
}

async function upsertUserWithEmail({ username, firstName, lastName, email, status, passwordHash }) {
  // Create UserEmail first
  const userEmail = await prisma.userEmail.upsert({
    where: { email },
    update: {},
    create: {
      email,
      isVerified: true,
      isPrimary: true,
    },
  });

  // Upsert user with primaryEmailId set
  const user = await prisma.user.upsert({
    where: { name: username },
    update: {
      name: username,
      firstName,
      lastName,
      status,
      passwordHash,
      primaryEmailId: userEmail.id,
    },
    create: {
      name: username,
      firstName,
      lastName,
      status,
      passwordHash,
      primaryEmailId: userEmail.id,
      emails: { connect: { id: userEmail.id } },
    },
    select: { id: true, name: true, status: true },
  });

  // Link UserEmail to user if not already
  await prisma.userEmail.update({
    where: { id: userEmail.id },
    data: { userId: user.id },
  });

  return user;
}

async function seedOwnerUser() {
  const username = "heimdallr";
  const email = "heimdallr@sovereign.local";
  const status = "active";
  const password = "ffp@2025";
  const passwordHash = await argon2.hash(password, { type: argon2.argon2id });

  const user = await upsertUserWithEmail({
    username,
    firstName: "Heim",
    lastName: "Dall",
    email,
    status,
    passwordHash,
  });

  // Assign platform_admin role
  const platformAdminRole = await prisma.userRole.findUnique({ where: { key: "platform_admin" } });
  if (platformAdminRole) {
    await prisma.userRoleAssignment.upsert({
      where: { userId_roleId: { userId: user.id, roleId: platformAdminRole.id } },
      update: {},
      create: { userId: user.id, roleId: platformAdminRole.id },
    });
  }

  console.log("Owner user seeded:", user);
  console.log(`Login with -> username: ${username}  password: ${password}`);
}

async function seedTestUsers() {
  const roles = await prisma.userRole.findMany({ orderBy: { id: "asc" } });
  for (let i = 0; i < roles.length; i++) {
    const role = roles[i];
    let firstName = "John";
    let lastName = "Doe";
    let username = `testuser${i}`;
    let email = `testuser${i}@sovereign.local`;
    let password = `testpass${i}`;

    // If role is a bot, use bot names
    if (role.key === "sovereign_bot") {
      firstName = "Sovereign";
      lastName = "Bot";
      username = "sovereignbot";
      email = "sovereignbot@sovereign.local";
      password = "sovereignbotpass";
    }

    const passwordHash = await argon2.hash(password, { type: argon2.argon2id });

    const user = await upsertUserWithEmail({
      username,
      firstName,
      lastName,
      email,
      status: "active",
      passwordHash,
    });

    await prisma.userRoleAssignment.upsert({
      where: { userId_roleId: { userId: user.id, roleId: role.id } },
      update: {},
      create: { userId: user.id, roleId: role.id },
    });

    console.log(`Test user seeded: ${username} (${role.key}) password: ${password}`);
  }
}

async function main() {
  // Clean up ephemeral tables
  // TODO: Consider using prisma migrate reset --force
  await prisma.session.deleteMany().catch(() => {});
  await prisma.verificationToken.deleteMany().catch(() => {});
  await prisma.passwordResetToken.deleteMany().catch(() => {});

  await seedRBAC();
  await seedOwnerUser();

  if (process.env.NODE_ENV === "development") {
    await seedTestUsers();
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
