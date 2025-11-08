// eslint-disable-next-line import/order
import crypto from "crypto";
import argon2 from "argon2";

import { prisma } from "../services/database.js";
import env from "../config/env.js";
import logger from "../services/logger.js";

const { AUTH_SESSION_COOKIE_NAME, SESSION_TTL_MS, COOKIE_OPTS, PLUGIN_CAPABILITIES_SIGNATURE } =
  env();

const CAPABILITY_PRECEDENCE = {
  allow: 6,
  consent: 5,
  compliance: 4,
  scoped: 3,
  anonymized: 2,
  deny: 1,
};

async function resolvePrimaryEmailSnapshot(user) {
  if (!user) return null;

  const normalizeRecord = (record) => {
    if (!record) return null;
    return {
      id: record.id ?? null,
      email: record.email ?? null,
      isVerified: record.isVerified ?? record.is_verified ?? false,
    };
  };

  if (user.primaryEmail && user.primaryEmail.email) {
    return normalizeRecord(user.primaryEmail);
  }

  if (user.primaryEmail && typeof user.primaryEmail === "string") {
    return {
      id: user.primaryEmailId ?? null,
      email: user.primaryEmail,
      isVerified: !!user.primaryEmailVerified,
    };
  }

  if (typeof user.sessionEmail === "string" && user.sessionEmail) {
    return {
      id: user.sessionEmailId ?? null,
      email: user.sessionEmail,
      isVerified: true,
    };
  }

  if (Array.isArray(user.emails) && user.emails.length > 0) {
    const primary = user.emails.find((e) => e && e.isPrimary) || user.emails[0];
    return normalizeRecord(primary);
  }

  if (user.primaryEmailId) {
    const emailRecord = await prisma.userEmail.findUnique({
      where: { id: user.primaryEmailId },
      select: { id: true, email: true, isVerified: true },
    });
    if (emailRecord) return normalizeRecord(emailRecord);
  }

  if (user.email) {
    return {
      id: user.primaryEmailId ?? null,
      email: user.email,
      isVerified: true,
    };
  }

  return null;
}

function buildUserSnapshot(user, primaryEmail) {
  const safePrimary = primaryEmail
    ? {
        id: primaryEmail.id ?? null,
        email: primaryEmail.email ?? null,
        isVerified: !!primaryEmail.isVerified,
      }
    : null;

  return {
    id: user.id,
    name: user.name ?? null,
    firstName: user.firstName ?? null,
    lastName: user.lastName ?? null,
    pictureUrl: user.pictureUrl ?? null,
    primaryEmail: safePrimary,
    primaryEmailId: safePrimary?.id ?? user.primaryEmailId ?? user.sessionEmailId ?? null,
  };
}

export async function hashPassword(pwd) {
  return argon2.hash(pwd, {
    type: argon2.argon2id,
    memoryCost: Number(process.env.AUTH_ARGON2_MEMORY ?? 19456),
    timeCost: Number(process.env.AUTH_ARGON2_ITERATIONS ?? 2),
    parallelism: Number(process.env.AUTH_ARGON2_PARALLELISM ?? 1),
  });
}

export function randomToken(bytes = 48) {
  return crypto.randomBytes(bytes).toString("hex");
}

function hashIp(ip) {
  return crypto
    .createHash("sha256")
    .update(ip ?? "")
    .digest("hex");
}

// Guest user helpers (needed for guest login + bypass)
export async function createRandomGuestUser() {
  while (true) {
    const suffix = crypto.randomBytes(4).toString("hex");
    const name = `guest_${suffix}`;
    const email = `guest+${suffix}@guest.local`;

    const existing = await prisma.user.findFirst({
      where: { name },
      select: { id: true },
    });
    if (existing) continue;

    const passwordHash = await hashPassword(randomToken(12));

    const user = await prisma.user.create({
      data: {
        name,
        firstName: "Guest",
        lastName: suffix,
        status: "active",
        passwordHash,
      },
    });

    const userEmail = await prisma.userEmail.create({
      data: {
        email,
        userId: user.id,
        isVerified: true,
        isPrimary: true,
      },
    });

    await prisma.user.update({
      where: { id: user.id },
      data: { primaryEmailId: userEmail.id },
    });

    // return freshly built user with primary email for callers
    return prisma.user.findUnique({
      where: { id: user.id },
      include: { emails: true },
    });
  }
}

export async function getOrCreateSingletonGuestUser() {
  // prefer to return a user with email info
  let user = await prisma.user.findFirst({
    where: { name: "guest" },
    include: { emails: true },
  });
  if (user) return user;

  try {
    const passwordHash = await hashPassword(randomToken(16));
    const created = await prisma.user.create({
      data: {
        name: "guest",
        firstName: "Guest",
        lastName: "User",
        status: "active",
        passwordHash,
      },
    });

    const userEmail = await prisma.userEmail.create({
      data: {
        email: "guest@guest.local",
        userId: created.id,
        isVerified: true,
        isPrimary: true,
      },
    });

    await prisma.user.update({
      where: { id: created.id },
      data: { primaryEmailId: userEmail.id },
    });

    return prisma.user.findUnique({
      where: { id: created.id },
      include: { emails: true },
    });
  } catch {
    // race condition: another process likely created it — fetch again
    return prisma.user.findFirst({
      where: { name: "guest" },
      include: { emails: true },
    });
  }
}

function buildRoleCapabilitySnapshot(assignments = []) {
  const roles = [];
  const capabilities = {};
  for (const assignment of assignments) {
    const role = assignment?.role;
    if (!role) continue;
    roles.push({
      id: role.id,
      key: role.key,
      label: role.label,
      level: role.level,
      scope: role.scope,
    });
    for (const rc of role.roleCapabilities || []) {
      const key = rc.capabilityKey;
      if (!key) continue;
      const value = String(rc.value || "deny");
      if (
        !capabilities[key] ||
        CAPABILITY_PRECEDENCE[value] > CAPABILITY_PRECEDENCE[capabilities[key]]
      ) {
        capabilities[key] = value;
      }
    }
  }
  return { roles, capabilities };
}

async function reloadRoleAssignments(userId) {
  return prisma.userRoleAssignment.findMany({
    where: { userId },
    include: {
      role: {
        include: {
          roleCapabilities: true,
        },
      },
    },
  });
}

async function refreshSessionCapabilitySnapshot(session) {
  const assignments = await reloadRoleAssignments(session.userId);
  const { roles, capabilities } = buildRoleCapabilitySnapshot(assignments);
  await prisma.session.update({
    where: { token: session.token },
    data: {
      roles,
      capabilities,
      capabilitiesSignature: PLUGIN_CAPABILITIES_SIGNATURE || null,
    },
  });
  return { roles, capabilities };
}

export async function createSession(req, res, user) {
  const token = randomToken(48);
  const expiresAt = new Date(Date.now() + SESSION_TTL_MS);

  let roles = [];
  let capabilities = {};
  try {
    const snapshot = buildRoleCapabilitySnapshot(user.roleAssignments || []);
    roles = snapshot.roles;
    capabilities = snapshot.capabilities;
  } catch (err) {
    logger.warn("Failed to build role snapshot for session", err);
  }

  const primaryEmail = await resolvePrimaryEmailSnapshot(user);
  const userSnapshot = buildUserSnapshot(user, primaryEmail);

  await prisma.session.create({
    data: {
      userId: user.id,
      token,
      userAgent: req.get("user-agent") || undefined,
      ipHash: hashIp(req.ip),
      expiresAt,
      roles,
      capabilities,
      userSnapshot,
      capabilitiesSignature: PLUGIN_CAPABILITIES_SIGNATURE || null,
    },
  });
  res.cookie(AUTH_SESSION_COOKIE_NAME, token, {
    ...COOKIE_OPTS,
    expires: expiresAt,
  });
}

export async function getSessionWithUser(token) {
  if (!token) return null;
  const s = await prisma.session.findUnique({
    where: { token },
  });
  if (!s || s.expiresAt < new Date()) {
    if (s) {
      try {
        await prisma.session.delete({ where: { token } });
      } catch (err) {
        logger.warn("Failed to delete expired session", err);
      }
    }
    return null;
  }
  let snapshot = s.userSnapshot || null;

  if (!snapshot) {
    const user = await prisma.user.findUnique({
      where: { id: s.userId },
      select: {
        id: true,
        name: true,
        firstName: true,
        lastName: true,
        pictureUrl: true,
        primaryEmailId: true,
        primaryEmail: {
          select: { id: true, email: true, isVerified: true },
        },
      },
    });

    if (!user) {
      try {
        await prisma.session.delete({ where: { token } });
      } catch (err) {
        logger.warn("Failed to delete session for missing user", err);
      }
      return null;
    }

    const primaryEmail = await resolvePrimaryEmailSnapshot(user);
    snapshot = buildUserSnapshot(user, primaryEmail);

    try {
      await prisma.session.update({
        where: { token },
        data: { userSnapshot: snapshot },
      });
    } catch (err) {
      logger.warn("Failed to persist session user snapshot", err);
    }
  }

  let roles = s.roles || [];
  let capabilities = s.capabilities || {};

  if (PLUGIN_CAPABILITIES_SIGNATURE && s.capabilitiesSignature !== PLUGIN_CAPABILITIES_SIGNATURE) {
    try {
      const refreshed = await refreshSessionCapabilitySnapshot(s);
      roles = refreshed.roles;
      capabilities = refreshed.capabilities;
      s.roles = roles;
      s.capabilities = capabilities;
      s.capabilitiesSignature = PLUGIN_CAPABILITIES_SIGNATURE;
    } catch (err) {
      logger.warn("Failed to refresh session capability snapshot", err);
    }
  }

  return {
    id: s.id,
    userId: s.userId,
    token: s.token,
    ipHash: s.ipHash,
    userAgent: s.userAgent,
    createdAt: s.createdAt,
    expiresAt: s.expiresAt,
    user: {
      ...snapshot,
      roles,
      capabilities,
    },
  };
}

export function verifyPassword(hash, pwd) {
  return argon2.verify(hash, pwd);
}
