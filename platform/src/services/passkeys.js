import crypto from "node:crypto";

import {
  generateAuthenticationOptions,
  generateRegistrationOptions,
  verifyAuthenticationResponse,
  verifyRegistrationResponse,
} from "@simplewebauthn/server";
import { isoBase64URL } from "@simplewebauthn/server/helpers";

import env from "$/config/env.js";
import { prisma } from "$/services/database.js";
import logger from "$/services/logger.js";

const config = env();

const {
  FEATURE_PASSKEYS_ENABLED,
  WEBAUTHN_RP_ID,
  WEBAUTHN_RP_NAME,
  WEBAUTHN_ORIGIN,
  WEBAUTHN_TIMEOUT_MS,
  WEBAUTHN_CHALLENGE_TTL_MS,
  IS_PROD,
} = config;

export const PASSKEY_CHALLENGE_COOKIE = "svg_passkey_challenge";

const CHALLENGE_TTL_MS = Number(WEBAUTHN_CHALLENGE_TTL_MS) || 5 * 60 * 1000;

const cookieOpts = Object.freeze({
  httpOnly: true,
  sameSite: "lax",
  secure: IS_PROD,
  path: "/",
});

function ensureEnabled() {
  if (!FEATURE_PASSKEYS_ENABLED) {
    const err = new Error("Passkeys are disabled by configuration");
    err.code = "passkeys_disabled";
    throw err;
  }
}

function deriveUserDisplay(user) {
  if (!user) return { userName: "unknown", userDisplayName: "Unknown" };
  const primaryEmail =
    user.primaryEmail?.email ||
    (Array.isArray(user.emails) ? user.emails.find((e) => e?.isPrimary)?.email : null);
  const display = [user.firstName, user.lastName].filter(Boolean).join(" ").trim();
  return {
    userName: primaryEmail || user.name || user.id,
    userDisplayName: display || primaryEmail || user.name || user.id,
  };
}

function toCredentialDescriptor(record) {
  if (!record?.credentialId) return null;
  return {
    id: isoBase64URL.toBuffer(record.credentialId),
    type: "public-key",
    transports: Array.isArray(record.transports) ? record.transports : undefined,
  };
}

function toAuthenticator(record) {
  return {
    credentialID: isoBase64URL.toBuffer(record.credentialId),
    credentialPublicKey: isoBase64URL.toBuffer(record.publicKey),
    counter: Number(record.counter || 0),
    transports: Array.isArray(record.transports) ? record.transports : [],
  };
}

function sanitizeCredential(record) {
  if (!record) return null;
  return {
    id: record.id,
    credentialId: record.credentialId,
    deviceType: record.deviceType || null,
    backedUp: !!record.backedUp,
    transports: Array.isArray(record.transports) ? record.transports : [],
    aaguid: record.aaguid || null,
    lastUsedAt: record.lastUsedAt || null,
    createdAt: record.createdAt || null,
  };
}

export function writeChallengeCookie(res, challengeId) {
  res.cookie(PASSKEY_CHALLENGE_COOKIE, challengeId, {
    ...cookieOpts,
    maxAge: CHALLENGE_TTL_MS,
  });
}

export function clearChallengeCookie(res) {
  res.clearCookie(PASSKEY_CHALLENGE_COOKIE, cookieOpts);
}

async function persistChallenge({
  id,
  challenge,
  type,
  userId,
  emailHint,
  requestedUV,
  expiresAt,
}) {
  await prisma.passkeyChallenge.create({
    data: {
      id,
      challenge,
      type,
      userId: userId || null,
      emailHint: emailHint || null,
      requestedUserVerification: requestedUV || null,
      expiresAt,
    },
  });
}

async function getChallenge(id) {
  if (!id) return null;
  return prisma.passkeyChallenge.findUnique({ where: { id } });
}

async function deleteChallenge(id) {
  if (!id) return;
  try {
    await prisma.passkeyChallenge.delete({ where: { id } });
  } catch (err) {
    logger.warn("Failed to delete passkey challenge", { err, id });
  }
}

async function pruneChallenges() {
  const now = new Date();
  try {
    await prisma.passkeyChallenge.deleteMany({
      where: { expiresAt: { lt: now } },
    });
  } catch (err) {
    logger.warn("Failed to prune passkey challenges", err);
  }
}

export async function buildRegistrationOptions(user) {
  ensureEnabled();
  if (!user?.id) throw new Error("User missing for registration options");

  await pruneChallenges();

  const credentials = await prisma.passkeyCredential.findMany({
    where: { userId: user.id },
  });

  const { userName, userDisplayName } = deriveUserDisplay(user);

  const options = await generateRegistrationOptions({
    rpName: WEBAUTHN_RP_NAME,
    rpID: WEBAUTHN_RP_ID,
    userID: user.id,
    userName,
    userDisplayName,
    timeout: Number(WEBAUTHN_TIMEOUT_MS) || undefined,
    attestationType: "none",
    authenticatorSelection: {
      residentKey: "preferred",
      userVerification: "preferred",
    },
    excludeCredentials: credentials.map(toCredentialDescriptor).filter(Boolean),
  });

  const challengeId = isoBase64URL.fromBuffer(crypto.randomBytes(16));
  const expiresAt = new Date(Date.now() + CHALLENGE_TTL_MS);
  await persistChallenge({
    id: challengeId,
    challenge: options.challenge,
    type: "register",
    userId: user.id,
    requestedUV: "preferred",
    expiresAt,
  });

  return { options, challengeId };
}

export async function verifyRegistration({ response, challengeId, user }) {
  ensureEnabled();
  if (!response) throw new Error("Missing WebAuthn response");
  const challenge = await getChallenge(challengeId);
  if (!challenge || challenge.type !== "register") {
    const err = new Error("Registration challenge not found or expired");
    err.code = "challenge_not_found";
    throw err;
  }
  if (challenge.expiresAt < new Date()) {
    await deleteChallenge(challengeId);
    const err = new Error("Registration challenge expired");
    err.code = "challenge_expired";
    throw err;
  }
  if (challenge.userId && user?.id && challenge.userId !== user.id) {
    const err = new Error("Challenge does not belong to this user");
    err.code = "challenge_mismatch";
    throw err;
  }

  try {
    const verification = await verifyRegistrationResponse({
      response,
      expectedChallenge: challenge.challenge,
      expectedOrigin: WEBAUTHN_ORIGIN,
      expectedRPID: WEBAUTHN_RP_ID,
      requireUserVerification: true,
    });

    if (!verification.verified || !verification.registrationInfo) {
      const err = new Error("Registration verification failed");
      err.code = "verification_failed";
      throw err;
    }

    const {
      credentialID,
      credentialPublicKey,
      counter,
      credentialDeviceType,
      credentialBackedUp,
      aaguid,
    } = verification.registrationInfo;

    const credentialIdB64 = isoBase64URL.fromBuffer(credentialID);
    const publicKeyB64 = isoBase64URL.fromBuffer(credentialPublicKey);

    const saved = await prisma.passkeyCredential.upsert({
      where: { credentialId: credentialIdB64 },
      create: {
        credentialId: credentialIdB64,
        publicKey: publicKeyB64,
        counter: BigInt(counter || 0),
        deviceType: credentialDeviceType || null,
        backedUp: !!credentialBackedUp,
        aaguid: aaguid ? isoBase64URL.fromBuffer(aaguid) : null,
        userId: user.id,
        transports: Array.isArray(response.response?.transports)
          ? response.response.transports
          : null,
        lastUsedAt: new Date(),
      },
      update: {
        publicKey: publicKeyB64,
        counter: BigInt(counter || 0),
        deviceType: credentialDeviceType || null,
        backedUp: !!credentialBackedUp,
        aaguid: aaguid ? isoBase64URL.fromBuffer(aaguid) : null,
        transports: Array.isArray(response.response?.transports)
          ? response.response.transports
          : undefined,
        lastUsedAt: new Date(),
      },
    });

    await deleteChallenge(challengeId);

    return sanitizeCredential(saved);
  } catch (err) {
    logger.warn("Passkey registration verification failed", err);
    throw err;
  }
}

export async function buildAuthenticationOptions({ user, emailHint }) {
  ensureEnabled();
  await pruneChallenges();

  let credentials = [];
  let userId = null;
  if (user?.id) {
    userId = user.id;
    credentials = await prisma.passkeyCredential.findMany({ where: { userId } });
    if (!credentials.length) {
      const err = new Error("No passkeys registered for this account");
      err.code = "no_credentials";
      throw err;
    }
  } else {
    const count = await prisma.passkeyCredential.count();
    if (!count) {
      const err = new Error("Passkey login unavailable");
      err.code = "no_credentials";
      throw err;
    }
  }

  const options = await generateAuthenticationOptions({
    rpID: WEBAUTHN_RP_ID,
    timeout: Number(WEBAUTHN_TIMEOUT_MS) || undefined,
    userVerification: "preferred",
    allowCredentials: credentials.map(toCredentialDescriptor).filter(Boolean),
  });

  const challengeId = isoBase64URL.fromBuffer(crypto.randomBytes(16));
  const expiresAt = new Date(Date.now() + CHALLENGE_TTL_MS);
  await persistChallenge({
    id: challengeId,
    challenge: options.challenge,
    type: "login",
    userId,
    emailHint: emailHint || null,
    requestedUV: "preferred",
    expiresAt,
  });

  return { options, challengeId };
}

export async function verifyAuthentication({ response, challengeId }) {
  ensureEnabled();
  if (!response) throw new Error("Missing WebAuthn response");
  const challenge = await getChallenge(challengeId);
  if (!challenge || challenge.type !== "login") {
    const err = new Error("Authentication challenge not found or expired");
    err.code = "challenge_not_found";
    throw err;
  }
  if (challenge.expiresAt < new Date()) {
    await deleteChallenge(challengeId);
    const err = new Error("Authentication challenge expired");
    err.code = "challenge_expired";
    throw err;
  }

  const credentialId = response.id || response.rawId;
  if (!credentialId) {
    const err = new Error("Missing credential id");
    err.code = "missing_credential_id";
    throw err;
  }

  const emailHint = challenge.emailHint || null;

  const credential = await prisma.passkeyCredential.findUnique({
    where: { credentialId },
  });
  if (!credential) {
    const err = new Error("Unknown credential");
    err.code = "credential_not_found";
    throw err;
  }

  const authenticator = toAuthenticator(credential);

  try {
    const verification = await verifyAuthenticationResponse({
      response,
      expectedChallenge: challenge.challenge,
      expectedOrigin: WEBAUTHN_ORIGIN,
      expectedRPID: WEBAUTHN_RP_ID,
      requireUserVerification: true,
      authenticator,
    });

    if (!verification.verified || !verification.authenticationInfo) {
      const err = new Error("Authentication verification failed");
      err.code = "verification_failed";
      throw err;
    }

    const { newCounter } = verification.authenticationInfo;
    const updated = await prisma.passkeyCredential.update({
      where: { credentialId },
      data: {
        counter: newCounter !== undefined ? BigInt(newCounter) : credential.counter,
        lastUsedAt: new Date(),
      },
    });

    await deleteChallenge(challengeId);

    const user = await prisma.user.findUnique({
      where: { id: updated.userId },
      include: {
        primaryEmail: { select: { email: true, isVerified: true, id: true } },
        emails: true,
        roleAssignments: {
          include: { role: { include: { roleCapabilities: true } } },
        },
      },
    });

    return { credential: sanitizeCredential(updated), user, emailHint };
  } catch (err) {
    logger.warn("Passkey authentication verification failed", err);
    throw err;
  }
}
