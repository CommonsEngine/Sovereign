import crypto from "node:crypto";

import env from "$/config/env.js";
import { prisma } from "$/services/database.js";
import logger from "$/services/logger.js";
import { syncProjectPrimaryOwner } from "$/utils/projectAccess.js";

const CROCKFORD_ALPHABET = "0123456789ABCDEFGHJKMNPQRSTVWXYZ";

function ensureSecret() {
  const { APP_SECRET } = env();
  const secret = String(APP_SECRET || "").trim();
  if (!secret) {
    throw new Error("APP_SECRET is not configured; required for invite HMAC.");
  }
  return secret;
}

function encodeBase32Crockford(buffer) {
  let bits = 0;
  let value = 0;
  let output = "";

  for (const byte of buffer) {
    value = (value << 8) | byte;
    bits += 8;
    while (bits >= 5) {
      const idx = (value >>> (bits - 5)) & 31;
      output += CROCKFORD_ALPHABET[idx];
      bits -= 5;
    }
  }

  if (bits > 0) {
    const idx = (value << (5 - bits)) & 31;
    output += CROCKFORD_ALPHABET[idx];
  }

  return output;
}

export function normalizeInviteCode(input) {
  if (!input) return "";
  if (typeof input === "string") return input.trim().toUpperCase();
  return String(input || "")
    .trim()
    .toUpperCase();
}

export function computeInviteHmac(rawCode) {
  const code = normalizeInviteCode(rawCode);
  if (!code) return null;
  const secret = ensureSecret();
  return crypto.createHmac("sha256", secret).update(code).digest("hex");
}

export function generateInviteCode() {
  const raw = crypto.randomBytes(20); // 160 bits
  const encoded = encodeBase32Crockford(raw);
  const grouped = encoded.match(/.{1,4}/g)?.join("-") || encoded;
  const code = `INV-${grouped}`;
  const codeHmac = computeInviteHmac(code);
  const preview = code.slice(0, 10);
  return { code, codeHmac, preview };
}

export function deriveInviteStatus(invite, { now = new Date() } = {}) {
  if (!invite) return { status: "missing" };
  const revoked = !!invite.revokedAt;
  const expired = invite.expiresAt instanceof Date && invite.expiresAt <= now;
  const maxUses = invite.maxUses ?? null;
  const exhausted = maxUses !== null && invite.usedCount >= maxUses;

  if (revoked) return { status: "revoked", revoked: true, expired, exhausted };
  if (expired) return { status: "expired", revoked, expired: true, exhausted };
  if (exhausted) return { status: "exhausted", revoked, expired, exhausted: true };
  return {
    status: "active",
    revoked,
    expired,
    exhausted,
    remaining: maxUses ? Math.max(maxUses - invite.usedCount, 0) : null,
  };
}

export function validateInviteForEmail(invite, email) {
  const normalizedEmail = typeof email === "string" ? email.trim().toLowerCase() : "";
  if (!invite) {
    return { ok: false, reason: "not_found" };
  }
  const status = deriveInviteStatus(invite);
  if (status.status !== "active") {
    return { ok: false, reason: status.status };
  }
  if (invite.allowedEmail) {
    const expected = invite.allowedEmail.trim().toLowerCase();
    if (normalizedEmail !== expected) {
      return { ok: false, reason: "email_mismatch" };
    }
  }
  if (invite.allowedDomain) {
    const domain = normalizedEmail.includes("@") ? normalizedEmail.split("@").pop() : "";
    const normalizedDomain = invite.allowedDomain.trim().toLowerCase();
    if (!domain || domain.toLowerCase() !== normalizedDomain) {
      return { ok: false, reason: "domain_mismatch" };
    }
  }
  return { ok: true };
}

async function assignRoleByKey(tx, userId, roleKey) {
  if (!roleKey) return null;
  const normalized = String(roleKey).trim();
  if (!normalized) return null;
  const role =
    (await tx.userRole.findUnique({ where: { key: normalized } })) ||
    (await tx.userRole.findFirst({
      where: { key: { equals: normalized, mode: "insensitive" } },
    }));
  if (!role) return null;

  await tx.userRoleAssignment.upsert({
    where: { userId_roleId: { userId, roleId: role.id } },
    update: {},
    create: { userId, roleId: role.id },
  });
  return role;
}

function deriveProjectRole(inviteRoleKey) {
  if (!inviteRoleKey) return "viewer";
  const val = String(inviteRoleKey).toLowerCase();
  if (val.includes("owner")) return "owner";
  if (val.includes("editor")) return "editor";
  if (val.includes("viewer")) return "viewer";
  return "viewer";
}

async function ensureProjectMembership(tx, invite, userId, email) {
  if (!invite?.projectId) return null;
  const projectId = invite.projectId;
  const existing = await tx.projectContributor.findFirst({
    where: {
      projectId,
      OR: [{ userId }, email ? { invitedEmail: email } : null].filter(Boolean),
    },
    select: { id: true },
  });

  const now = new Date();
  const role = deriveProjectRole(invite.roleKey);

  if (existing) {
    const member = await tx.projectContributor.update({
      where: { id: existing.id },
      data: {
        userId,
        invitedEmail: email || undefined,
        role,
        status: "active",
        acceptedAt: now,
      },
    });
    await syncProjectPrimaryOwner(projectId, { prisma: tx }).catch((err) => {
      logger.warn("Failed to sync primary owner after invite acceptance", err);
    });
    return member;
  }

  const member = await tx.projectContributor.create({
    data: {
      projectId,
      userId,
      invitedEmail: email || null,
      role,
      status: "active",
      invitedAt: now,
      acceptedAt: now,
    },
  });
  await syncProjectPrimaryOwner(projectId, { prisma: tx }).catch((err) => {
    logger.warn("Failed to sync primary owner after invite acceptance", err);
  });
  return member;
}

export async function findInvite(codeOrToken) {
  const raw =
    typeof codeOrToken === "string" ? codeOrToken.trim() : String(codeOrToken || "").trim();
  if (!raw) return null;
  const normalized = normalizeInviteCode(raw);
  const looksLikeHmac = /^[a-f0-9]{64}$/i.test(raw);
  const codeHmac = looksLikeHmac ? raw.toLowerCase() : computeInviteHmac(normalized);
  if (!codeHmac) return null;
  return prisma.invite.findUnique({ where: { codeHmac } });
}

export async function redeemInviteForUser({
  invite,
  inviteCode,
  inviteToken,
  userId,
  email,
  ip,
  userAgent,
  tx: externalTx = null,
}) {
  const lookup = invite || (await findInvite(inviteCode || inviteToken));
  if (!lookup) {
    return { ok: false, error: "Invite not found" };
  }
  const normalizedEmail = typeof email === "string" ? email.trim().toLowerCase() : "";
  const runner = externalTx ? (fn) => fn(externalTx) : (fn) => prisma.$transaction(fn);

  try {
    const result = await runner(async (tx) => {
      const freshInvite = await tx.invite.findUnique({
        where: { id: lookup.id },
      });
      const status = validateInviteForEmail(freshInvite, normalizedEmail);
      if (!status.ok) {
        throw new Error(status.reason || "invalid_invite");
      }

      const existingUse = await tx.inviteUse.findUnique({
        where: { inviteId_userId: { inviteId: freshInvite.id, userId } },
      });
      if (existingUse) {
        return { invite: freshInvite, use: existingUse, alreadyUsed: true };
      }

      await tx.inviteUse.create({
        data: {
          inviteId: freshInvite.id,
          userId,
          email: normalizedEmail,
          ip: ip || null,
          userAgent: userAgent || null,
        },
      });

      await tx.invite.update({
        where: { id: freshInvite.id },
        data: { usedCount: { increment: 1 } },
      });

      // Assign role (if matching userRole exists) and ensure platform:user baseline
      await assignRoleByKey(tx, userId, freshInvite.roleKey);
      await assignRoleByKey(tx, userId, "platform:user");

      await ensureProjectMembership(tx, freshInvite, userId, normalizedEmail);

      return { invite: freshInvite };
    });

    return { ok: true, ...result };
  } catch (err) {
    logger.warn("Failed to redeem invite", { err });
    return { ok: false, error: err?.message || "Invite redemption failed" };
  }
}

export async function createInvite({
  createdByUserId,
  roleKey,
  tenantId = null,
  projectId = null,
  maxUses = null,
  expiresAt = null,
  allowedEmail = null,
  allowedDomain = null,
}) {
  if (!prisma?.invite?.create) {
    throw new Error(
      "Invite model unavailable in Prisma client; run prisma:compose and prisma:generate/migrate in this environment."
    );
  }
  if (!createdByUserId) {
    throw new Error("createdByUserId is required to create an invite");
  }
  const { code, codeHmac, preview } = generateInviteCode();
  const normalizedEmail =
    typeof allowedEmail === "string" && allowedEmail.trim()
      ? allowedEmail.trim().toLowerCase()
      : null;
  const normalizedDomain =
    typeof allowedDomain === "string" && allowedDomain.trim()
      ? allowedDomain.trim().toLowerCase()
      : null;

  const invite = await prisma.invite.create({
    data: {
      codeHmac,
      codePreview: preview,
      tenantId,
      projectId,
      roleKey,
      maxUses: maxUses ?? null,
      expiresAt: expiresAt || null,
      allowedEmail: normalizedEmail,
      allowedDomain: normalizedDomain,
      createdByUserId,
    },
  });

  return { invite, code };
}

export function serializeInvite(invite) {
  if (!invite) return null;
  const status = deriveInviteStatus(invite);
  const remaining =
    invite.maxUses === null || invite.maxUses === undefined
      ? null
      : Math.max((invite.maxUses || 0) - (invite.usedCount || 0), 0);
  return {
    id: invite.id,
    codePreview: invite.codePreview || null,
    tenantId: invite.tenantId || null,
    projectId: invite.projectId || null,
    roleKey: invite.roleKey,
    maxUses: invite.maxUses,
    usedCount: invite.usedCount,
    remainingUses: remaining,
    expiresAt: invite.expiresAt,
    revokedAt: invite.revokedAt,
    allowedEmail: invite.allowedEmail,
    allowedDomain: invite.allowedDomain,
    createdByUserId: invite.createdByUserId,
    createdAt: invite.createdAt,
    updatedAt: invite.updatedAt,
    status: status.status,
  };
}
