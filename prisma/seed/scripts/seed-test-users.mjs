/* eslint-disable import/order */
import argon2 from "argon2";
import fs from "fs";
import path from "path";

const isDev = process.env.NODE_ENV === "development";
const usersPath = path.resolve(process.cwd(), "prisma/seed/users.json");

export default async function seedTestUsers(prisma) {
  if (!prisma) {
    throw new Error("seedTestUsers requires a Prisma client instance");
  }

  if (!fs.existsSync(usersPath)) {
    console.warn("seedTestUsers: users.json not found, skipping");
    return;
  }

  let usersPayload;
  try {
    usersPayload = JSON.parse(fs.readFileSync(usersPath, "utf8"));
  } catch (err) {
    console.error("seedTestUsers: failed to parse users.json", err);
    return;
  }

  const entries = Array.isArray(usersPayload.users) ? usersPayload.users : [];
  if (entries.length === 0) {
    console.warn("seedTestUsers: users.json contains no users");
    return;
  }

  const requestedRoleKeys = Array.from(
    new Set(
      entries
        .flatMap((u) => (Array.isArray(u.roles) ? u.roles : []))
        .filter(Boolean),
    ),
  );

  const roles =
    requestedRoleKeys.length > 0
      ? await prisma.userRole.findMany({
          where: { key: { in: requestedRoleKeys } },
        })
      : [];
  const roleMap = new Map(roles.map((role) => [role.key, role]));

  for (const entry of entries) {
    const {
      name,
      firstName,
      lastName,
      email,
      password,
      status = "active",
      roles: entryRoles = [],
      type = "human",
      isTestUser = true,
      devOnly = true,
    } = entry;

    if (devOnly && !isDev) {
      console.log(
        `seedTestUsers: skipping devOnly user ${name} in non-development env`,
      );
      continue;
    }

    if (!name || !email || !password) {
      console.warn("seedTestUsers: skipping invalid entry", entry);
      continue;
    }

    const userType = type === "bot" ? "bot" : "human";
    const passwordHash = await argon2.hash(password, { type: argon2.argon2id });

    const user = await prisma.user.upsert({
      where: { name },
      update: {
        type: userType,
        firstName,
        lastName,
        status,
        passwordHash,
        isTestUser,
      },
      create: {
        name,
        type: userType,
        firstName,
        lastName,
        status,
        passwordHash,
        isTestUser,
      },
      select: { id: true, name: true },
    });

    const userEmail = await prisma.userEmail.upsert({
      where: { email },
      update: { userId: user.id, isVerified: true, isPrimary: true },
      create: {
        email,
        userId: user.id,
        isVerified: true,
        isPrimary: true,
      },
      select: { id: true },
    });

    if (userEmail?.id) {
      await prisma.user.update({
        where: { id: user.id },
        data: { primaryEmailId: userEmail.id },
      });
    }

    for (const roleKey of entryRoles) {
      if (!roleMap.has(roleKey)) {
        console.warn(`seedTestUsers: missing role ${roleKey}, skipping`);
        continue;
      }

      const role = roleMap.get(roleKey);
      await prisma.userRoleAssignment.upsert({
        where: {
          userId_roleId: { userId: user.id, roleId: role.id },
        },
        update: {},
        create: { userId: user.id, roleId: role.id },
      });
    }

    console.log(`seedTestUsers: seeded ${user.name} (${email})`);
  }
}
