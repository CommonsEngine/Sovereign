// eslint-disable-next-line import/order
import crypto from "crypto";
import argon2 from "argon2";

import { SESSION_COOKIE, SESSION_TTL_MS, COOKIE_OPTS } from "../config.mjs";
import prisma from "../prisma.mjs";

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
    const username = `guest_${suffix}`;
    const email = `guest+${suffix}@guest.local`;
    const existing = await prisma.user.findFirst({
      where: { OR: [{ username }, { email }] },
      select: { id: true },
    });
    if (existing) continue;
    const passwordHash = await hashPassword(randomToken(12));
    return prisma.user.create({
      data: { username, email, passwordHash },
    });
  }
}

export async function getOrCreateSingletonGuestUser() {
  let user = await prisma.user.findFirst({ where: { username: "guest" } });
  if (user) return user;
  // Attempt to create singleton; handle race by retry fetch
  try {
    const passwordHash = await hashPassword(randomToken(16));
    user = await prisma.user.create({
      data: {
        username: "guest",
        email: "guest@guest.local",
        passwordHash,
      },
    });
    return user;
  } catch {
    // Another request likely created it; fetch again
    return prisma.user.findFirst({ where: { username: "guest" } });
  }
}

export async function createSession(res, user, req) {
  const token = randomToken(48);
  const expiresAt = new Date(Date.now() + SESSION_TTL_MS);
  await prisma.session.create({
    data: {
      userId: user.id,
      token,
      userAgent: req.get("user-agent") || undefined,
      ipHash: hashIp(req.ip),
      expiresAt,
    },
  });
  res.cookie(SESSION_COOKIE, token, { ...COOKIE_OPTS, expires: expiresAt });
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
      } catch (error) {
        console.warn("Failed to delete expired session", error);
      }
    }
    return null;
  }
  return s;
}

export function verifyPassword(hash, pwd) {
  return argon2.verify(hash, pwd);
}
