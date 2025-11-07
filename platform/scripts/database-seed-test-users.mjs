/* eslint-disable import/order */
import argon2 from "argon2";
import fs from "fs";
import path from "path";

const isDev = process.env.NODE_ENV === "development";
const usersPath = path.resolve(process.cwd(), "scripts/data/users.json");

export default async function seedTestUsers(prisma) {
  if (!prisma) {
    throw new Error("✗ seedTestUsers requires a Prisma client instance");
  }

  if (!fs.existsSync(usersPath)) {
    console.warn("✗ seedTestUsers: users.json not found, skipping");
    return;
  }

  let usersPayload;
  try {
    usersPayload = JSON.parse(fs.readFileSync(usersPath, "utf8"));
  } catch (err) {
    console.error("✗ seedTestUsers: failed to parse users.json", err);
    return;
  }

  const entries = Array.isArray(usersPayload.users) ? usersPayload.users : [];
  if (entries.length === 0) {
    console.warn("✗ seedTestUsers: users.json contains no users");
    return;
  }

  const requestedRoleKeys = Array.from(
    new Set(entries.flatMap((u) => (Array.isArray(u.roles) ? u.roles : [])).filter(Boolean))
  );

  const roles =
    requestedRoleKeys.length > 0
      ? await prisma.userRole.findMany({
          where: { key: { in: requestedRoleKeys } },
          include: { roleCapabilities: true },
        })
      : [];
  const roleMap = new Map(roles.map((role) => [role.key, role]));

  const precedence = {
    allow: 6,
    consent: 5,
    compliance: 4,
    scoped: 3,
    anonymized: 2,
    deny: 1,
  };

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
      console.log(`✗ seedTestUsers: skipping devOnly user ${name} in non-development env`);
      continue;
    }

    if (!name || !email || !password) {
      console.warn("✗ seedTestUsers: skipping invalid entry", entry);
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
    const normalizedRoleKeys = Array.from(
      new Set(
        (Array.isArray(entryRoles) ? entryRoles : [])
          .map((key) => (typeof key === "string" ? key.trim() : ""))
          .filter(Boolean)
      )
    );

    const desiredRoles = [];
    for (const roleKey of normalizedRoleKeys) {
      if (!roleMap.has(roleKey)) {
        console.warn(`✗ seedTestUsers: missing role ${roleKey}, skipping`);
        continue;
      }

      const role = roleMap.get(roleKey);
      desiredRoles.push(role);
      await prisma.userRoleAssignment.upsert({
        where: {
          userId_roleId: { userId: user.id, roleId: role.id },
        },
        update: {},
        create: { userId: user.id, roleId: role.id },
      });
    }

    const desiredRoleIds = desiredRoles.map((role) => role.id);

    if (desiredRoleIds.length === 0) {
      await prisma.userRoleAssignment.deleteMany({
        where: { userId: user.id },
      });
    } else {
      await prisma.userRoleAssignment.deleteMany({
        where: { userId: user.id, roleId: { notIn: desiredRoleIds } },
      });
    }

    const aggregatedCapabilities = {};
    const roleSnapshots = [];

    for (const role of desiredRoles) {
      roleSnapshots.push({
        id: role.id,
        key: role.key,
        label: role.label,
        level: role.level,
        scope: role.scope,
      });

      for (const rc of role.roleCapabilities || []) {
        const key = rc.capabilityKey;
        const value = rc.value || "deny";
        const current = aggregatedCapabilities[key];
        if (!current) {
          aggregatedCapabilities[key] = value;
          continue;
        }
        if ((precedence[value] || 0) > (precedence[current] || 0)) {
          aggregatedCapabilities[key] = value;
        }
      }
    }

    // Ensure existing sessions reflect merged roles/capabilities snapshot
    await prisma.session.updateMany({
      where: { userId: user.id },
      data: {
        roles: roleSnapshots,
        capabilities: aggregatedCapabilities,
      },
    });

    console.log(`✓ seedTestUsers: seeded ${user.name} (${email})`);
  }
}
