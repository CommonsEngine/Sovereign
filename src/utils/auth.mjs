// eslint-disable-next-line import/order
import crypto from "crypto";
import argon2 from "argon2";

import env from "../config/env.mjs";
import prisma from "../prisma.mjs";

import logger from "./logger.mjs";

const { AUTH_SESSION_COOKIE_NAME, SESSION_TTL_MS, COOKIE_OPTS } = env();

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

export async function createSession(res, user, req) {
  const token = randomToken(48);
  const expiresAt = new Date(Date.now() + SESSION_TTL_MS);

  // Fetch roles + capabilities snapshot once at session creation time.
  // We'll not mutate DB schema here; instead store the computed snapshot in the session cookie as a small JSON payload.
  // Keep payload minimal: role keys and an effective capability map.
  let roles = [];
  let capabilities = {};
  try {
    const assignments = await prisma.userRoleAssignment.findMany({
      where: { userId: user.id },
      include: {
        role: {
          include: {
            roleCapabilities: {
              include: { capability: true },
            },
          },
        },
      },
    });

    roles = assignments.map((a) => {
      const r = a.role;
      return {
        id: r.id,
        key: r.key,
        label: r.label,
        level: r.level,
        scope: r.scope,
      };
    });

    // Build effective capability map (role precedence not enforced here — later logic can implement precedence)
    for (const a of assignments) {
      for (const rc of a.role.roleCapabilities || []) {
        const key = rc.capabilityKey;
        const value = String(rc.value || "deny");
        // simple precedence: allow > consent > compliance > scoped > anonymized > deny
        const precedence = {
          allow: 6,
          consent: 5,
          compliance: 4,
          scoped: 3,
          anonymized: 2,
          deny: 1,
        };
        if (
          !capabilities[key] ||
          precedence[value] > precedence[capabilities[key]]
        ) {
          capabilities[key] = value;
        }
      }
    }
  } catch (err) {
    // Don't block session creation on RBAC read errors; log and proceed.
    logger.warn("Failed to fetch roles/capabilities for session snapshot", err);
  }

  // TODO: Maybe we can simply use database references in the session table to map
  // capabilities and roles with the user without storing the full JSON payload.

  await prisma.session.create({
    data: {
      userId: user.id,
      token,
      userAgent: req.get("user-agent") || undefined,
      ipHash: hashIp(req.ip),
      expiresAt,
      roles,
      capabilities,
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
    include: { user: true },
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
  return {
    id: s.id,
    userId: s.userId,
    token: s.token,
    ipHash: s.ipHash,
    userAgent: s.userAgent,
    createdAt: s.createdAt,
    expiresAt: s.expiresAt,
    user: {
      ...s.user,
      roles: s.roles || [],
      capabilities: s.capabilities || {},
    },
  };
}

export function verifyPassword(hash, pwd) {
  return argon2.verify(hash, pwd);
}
