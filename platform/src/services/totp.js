import crypto from "node:crypto";

import { authenticator } from "otplib";
import QRCode from "qrcode";

import env from "$/config/env.js";
import { prisma } from "$/services/database.js";
import logger from "$/services/logger.js";

const config = env();

const {
  FEATURE_TOTP_ENABLED,
  TOTP_ISSUER,
  TOTP_DIGITS,
  TOTP_PERIOD,
  TOTP_DRIFT_STEPS,
  TOTP_RECOVERY_CODES,
  TOTP_RECOVERY_LENGTH,
  APP_NAME,
  APP_SECRET,
} = config;

export const TOTP_PENDING_COOKIE = "svg_totp_pending";
const PENDING_TTL_MS = 10 * 60 * 1000;

function ensureEnabled() {
  if (!FEATURE_TOTP_ENABLED) {
    const err = new Error("TOTP is disabled");
    err.code = "totp_disabled";
    throw err;
  }
}

function getAuthenticator() {
  authenticator.options = {
    digits: Number(TOTP_DIGITS) || 6,
    step: Number(TOTP_PERIOD) || 30,
    window: Number(TOTP_DRIFT_STEPS) || 1,
  };
  return authenticator;
}

function randomToken(bytes = 32) {
  return crypto.randomBytes(bytes).toString("hex");
}

function hashRecovery(code) {
  const h = crypto.createHmac("sha256", APP_SECRET || APP_NAME || "secret");
  h.update(code.trim());
  return h.digest("hex");
}

function generateRecoveryCodes(
  count = Number(TOTP_RECOVERY_CODES) || 8,
  len = Number(TOTP_RECOVERY_LENGTH) || 10
) {
  const codes = [];
  while (codes.length < count) {
    const raw = crypto.randomBytes(Math.ceil(len)).toString("base64url").slice(0, len);
    codes.push(raw.toUpperCase());
  }
  return codes;
}

export async function createSetup(user) {
  ensureEnabled();
  if (!user?.id) throw new Error("User is required for TOTP setup");

  const auth = getAuthenticator();
  const secret = auth.generateSecret();

  const label = user.primaryEmail?.email || user.email || user.name || user.id;
  const issuer = TOTP_ISSUER || APP_NAME || "Sovereign";
  const otpauth = auth.keyuri(label, issuer, secret);
  let qrDataUrl = null;
  try {
    qrDataUrl = await QRCode.toDataURL(otpauth);
  } catch (err) {
    logger.warn("Failed generating QR for TOTP", err);
  }

  await prisma.userTotp.upsert({
    where: { userId: user.id },
    create: {
      userId: user.id,
      secret,
      verified: false,
    },
    update: {
      secret,
      verified: false,
      enabledAt: null,
      recoveryCodes: null,
    },
  });

  return { secret, otpauth, qrDataUrl };
}

export async function verifySetup(userId, code) {
  ensureEnabled();
  const rec = await prisma.userTotp.findUnique({ where: { userId } });
  if (!rec || !rec.secret) {
    const err = new Error("No TOTP setup in progress");
    err.code = "totp_setup_missing";
    throw err;
  }
  const auth = getAuthenticator();
  const ok = auth.check(String(code || "").trim(), rec.secret);
  if (!ok) {
    const err = new Error("Invalid TOTP code");
    err.code = "totp_invalid";
    throw err;
  }

  const recoveryCodes = generateRecoveryCodes();
  const hashed = recoveryCodes.map((c) => hashRecovery(c));

  await prisma.userTotp.update({
    where: { userId },
    data: {
      verified: true,
      enabledAt: new Date(),
      failedAttempts: 0,
      recoveryCodes: hashed,
    },
  });

  return recoveryCodes;
}

export async function disableTotp(userId) {
  ensureEnabled();
  try {
    await prisma.userTotp.delete({ where: { userId } });
  } catch {
    // ignore
  }
}

export async function isTotpEnabled(userId) {
  if (!FEATURE_TOTP_ENABLED) return false;
  const rec = await prisma.userTotp.findUnique({ where: { userId } });
  return !!(rec && rec.verified);
}

export async function hasTotp(userId) {
  const rec = await prisma.userTotp.findUnique({ where: { userId } });
  return rec || null;
}

export async function createPending(userId) {
  ensureEnabled();
  const token = randomToken(24);
  const expiresAt = new Date(Date.now() + PENDING_TTL_MS);
  await prisma.totpPending.create({
    data: { userId, token, expiresAt },
  });
  return { token, expiresAt };
}

export async function getPending(token) {
  if (!token) return null;
  const rec = await prisma.totpPending.findUnique({ where: { token } });
  if (!rec) return null;
  if (rec.expiresAt < new Date()) {
    try {
      await prisma.totpPending.delete({ where: { token } });
    } catch {
      /* ignore */
    }
    return null;
  }
  return rec;
}

export async function clearPending(token) {
  if (!token) return;
  try {
    await prisma.totpPending.delete({ where: { token } });
  } catch {
    /* ignore */
  }
}

export function setPendingCookie(res, token, expiresAt) {
  res.cookie(TOTP_PENDING_COOKIE, token, {
    httpOnly: true,
    sameSite: "lax",
    secure: config.IS_PROD,
    expires: expiresAt || new Date(Date.now() + PENDING_TTL_MS),
    path: "/",
  });
}

export function clearPendingCookie(res) {
  res.clearCookie(TOTP_PENDING_COOKIE, {
    httpOnly: true,
    sameSite: "lax",
    secure: config.IS_PROD,
    path: "/",
  });
}

export async function verifyLoginTotp(userId, code) {
  ensureEnabled();
  const rec = await prisma.userTotp.findUnique({ where: { userId } });
  if (!rec || !rec.verified || !rec.secret) {
    const err = new Error("TOTP not enabled");
    err.code = "totp_not_enabled";
    throw err;
  }
  const trimmed = String(code || "").trim();
  const auth = getAuthenticator();
  const ok = auth.check(trimmed, rec.secret);
  if (!ok) {
    await prisma.userTotp.update({
      where: { userId },
      data: { failedAttempts: { increment: 1 } },
    });
    const err = new Error("Invalid TOTP code");
    err.code = "totp_invalid";
    throw err;
  }
  await prisma.userTotp.update({
    where: { userId },
    data: { failedAttempts: 0, lastUsedAt: new Date() },
  });
}

export async function useRecoveryCode(userId, code) {
  ensureEnabled();
  const rec = await prisma.userTotp.findUnique({ where: { userId } });
  if (
    !rec ||
    !rec.verified ||
    !Array.isArray(rec.recoveryCodes) ||
    rec.recoveryCodes.length === 0
  ) {
    const err = new Error("Recovery codes unavailable");
    err.code = "recovery_unavailable";
    throw err;
  }
  const hashed = hashRecovery(code || "");
  if (!rec.recoveryCodes.includes(hashed)) {
    const err = new Error("Invalid recovery code");
    err.code = "recovery_invalid";
    throw err;
  }
  const remaining = rec.recoveryCodes.filter((c) => c !== hashed);
  await prisma.userTotp.update({
    where: { userId },
    data: { recoveryCodes: remaining, lastUsedAt: new Date() },
  });
}

export async function regenerateRecoveryCodes(userId) {
  ensureEnabled();
  const rec = await prisma.userTotp.findUnique({ where: { userId } });
  if (!rec || !rec.verified) {
    const err = new Error("TOTP not enabled");
    err.code = "totp_not_enabled";
    throw err;
  }
  const codes = generateRecoveryCodes();
  const hashed = codes.map((c) => hashRecovery(c));
  await prisma.userTotp.update({
    where: { userId },
    data: { recoveryCodes: hashed },
  });
  return codes;
}
