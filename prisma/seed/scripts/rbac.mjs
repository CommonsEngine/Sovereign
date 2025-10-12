/* eslint-disable import/order */
import argon2 from "argon2";
import fs from "fs";
import path from "path";

const rbacPath = path.resolve(process.cwd(), "prisma/seed/rbac.json");
const rbac = JSON.parse(fs.readFileSync(rbacPath, "utf8"));

export async function seedRBAC(prisma) {
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

async function upsertUserWithEmail(
  prisma,
  { username, firstName, lastName, email, status, passwordHash },
) {
  // 1. Upsert user without primaryEmailId
  let user = await prisma.user.upsert({
    where: { name: username },
    update: {
      name: username,
      firstName,
      lastName,
      status,
      passwordHash,
    },
    create: {
      name: username,
      firstName,
      lastName,
      status,
      passwordHash,
    },
    select: { id: true, name: true, status: true },
  });

  // 2. Upsert UserEmail with userId
  const userEmail = await prisma.userEmail.upsert({
    where: { email },
    update: {
      userId: user.id,
      isVerified: true,
      isPrimary: true,
    },
    create: {
      email,
      userId: user.id,
      isVerified: true,
      isPrimary: true,
    },
  });

  // 3. Update user's primaryEmailId if needed
  user = await prisma.user.update({
    where: { id: user.id },
    data: { primaryEmailId: userEmail.id },
    select: { id: true, name: true, status: true },
  });

  return user;
}

export async function seedOwnerUser(prisma) {
  const username = "heimdallr";
  const email = "heimdallr@sovereign.local";
  const status = "active";
  const password = "ffp@2025";
  const passwordHash = await argon2.hash(password, { type: argon2.argon2id });

  const user = await upsertUserWithEmail(prisma, {
    username,
    firstName: "Heim",
    lastName: "Dall",
    email,
    status,
    passwordHash,
  });

  // Assign platform_admin role
  const platformAdminRole = await prisma.userRole.findUnique({
    where: { key: "platform_admin" },
  });
  if (platformAdminRole) {
    await prisma.userRoleAssignment.upsert({
      where: {
        userId_roleId: { userId: user.id, roleId: platformAdminRole.id },
      },
      update: {},
      create: { userId: user.id, roleId: platformAdminRole.id },
    });
  }

  console.log("Owner user seeded:", user);
  console.log(`Login with -> username: ${username}  password: ${password}`);
}

export async function seedTestUsers(prisma) {
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

    const user = await upsertUserWithEmail(prisma, {
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

    console.log(
      `Test user seeded: ${username} (${role.key}) password: ${password}`,
    );
  }
}
