import express from "express";

import env from "$/config/env.js";
import { requireAuth } from "$/middlewares/auth.js";
import rateLimiters from "$/middlewares/rateLimit.js";
import logger from "$/services/logger.js";
import {
  buildAuthenticationOptions,
  buildRegistrationOptions,
  clearChallengeCookie,
  PASSKEY_CHALLENGE_COOKIE,
  verifyAuthentication,
  verifyRegistration,
  writeChallengeCookie,
} from "$/services/passkeys.js";
import { prisma } from "$/services/database.js";
import { createSession } from "$/utils/auth.js";

const router = express.Router();
const { FEATURE_PASSKEYS_ENABLED } = env();

function guardDisabled(res) {
  if (!FEATURE_PASSKEYS_ENABLED) {
    res.status(404).json({ error: "passkeys_disabled" });
    return true;
  }
  return false;
}

function normalizeEmail(value) {
  if (typeof value !== "string") return "";
  return value.trim().toLowerCase();
}

function ensureActiveUser(user, { emailVerified } = {}) {
  if (!user) {
    const err = new Error("User not found");
    err.statusCode = 404;
    err.code = "user_not_found";
    throw err;
  }
  const status = String(user.status || "").toLowerCase();
  if (status !== "active") {
    const err = new Error("Account inactive");
    err.statusCode = 403;
    err.code = "account_inactive";
    throw err;
  }
  const primaryEmailVerified = user.primaryEmail?.isVerified || emailVerified;
  if (!primaryEmailVerified) {
    const err = new Error("Primary email is not verified");
    err.statusCode = 403;
    err.code = "email_unverified";
    throw err;
  }
}

// Registration (authed)
router.post("/register/options", requireAuth, rateLimiters.authedApi, async (req, res) => {
  if (guardDisabled(res)) return;
  try {
    const user = await prisma.user.findUnique({
      where: { id: req.user.id },
      include: { primaryEmail: true, emails: true },
    });
    ensureActiveUser(user);

    const { options, challengeId } = await buildRegistrationOptions(user);
    writeChallengeCookie(res, challengeId);
    return res.json({ options, challengeId });
  } catch (err) {
    logger.warn("Passkey registration options failed", err);
    return res.status(err.statusCode || 400).json({
      error: err.code || "passkey_registration_options_failed",
      message: err.message || "Could not start passkey registration",
    });
  }
});

router.post("/register/verify", requireAuth, rateLimiters.authedApi, async (req, res) => {
  if (guardDisabled(res)) return;
  try {
    const challengeId = req.body?.challengeId || req.cookies?.[PASSKEY_CHALLENGE_COOKIE] || "";
    const credential = await verifyRegistration({
      response: req.body?.credential,
      challengeId,
      user: req.user,
    });
    clearChallengeCookie(res);
    return res.json({ ok: true, credential });
  } catch (err) {
    logger.warn("Passkey registration verify failed", err);
    return res.status(err.statusCode || 400).json({
      error: err.code || "passkey_registration_failed",
      message: err.message || "Could not verify passkey",
    });
  }
});

// Login (public)
router.post("/login/options", rateLimiters.public, async (req, res) => {
  if (guardDisabled(res)) return;
  try {
    const email = normalizeEmail(req.body?.email);
    let user = null;
    if (email) {
      const userEmailRec = await prisma.userEmail.findUnique({
        where: { email },
        include: { user: { include: { primaryEmail: true, emails: true } } },
      });
      if (!userEmailRec?.user) {
        return res.status(404).json({ error: "user_not_found", message: "User not found" });
      }
      user = userEmailRec.user;
      ensureActiveUser(user, { emailVerified: userEmailRec.isVerified });
    }

    const { options, challengeId } = await buildAuthenticationOptions({ user, emailHint: email });
    writeChallengeCookie(res, challengeId);
    return res.json({ options, challengeId });
  } catch (err) {
    logger.warn("Passkey login options failed", err);
    return res.status(err.statusCode || 400).json({
      error: err.code || "passkey_login_options_failed",
      message: err.message || "Could not start passkey login",
    });
  }
});

router.post("/login/verify", rateLimiters.public, async (req, res) => {
  if (guardDisabled(res)) return;
  try {
    const challengeId = req.body?.challengeId || req.cookies?.[PASSKEY_CHALLENGE_COOKIE] || "";
    const verification = await verifyAuthentication({
      response: req.body?.credential,
      challengeId,
    });
    const user = verification.user;
    ensureActiveUser(user);

    await createSession(req, res, {
      ...user,
      sessionEmail: user.primaryEmail?.email || verification.emailHint || null,
      sessionEmailId: user.primaryEmail?.id || null,
    });

    clearChallengeCookie(res);
    const dest =
      typeof req.body?.return_to === "string" && req.body.return_to.startsWith("/")
        ? req.body.return_to
        : "/";
    return res.json({ ok: true, redirect: dest });
  } catch (err) {
    logger.warn("Passkey login verify failed", err);
    return res.status(err.statusCode || 400).json({
      error: err.code || "passkey_login_failed",
      message: err.message || "Passkey login failed",
    });
  }
});

// Delete credential
router.delete("/:id", requireAuth, rateLimiters.authedApi, async (req, res) => {
  if (guardDisabled(res)) return;
  try {
    const { id } = req.params;
    const credential = await prisma.passkeyCredential.findUnique({ where: { id } });
    if (!credential || credential.userId !== req.user.id) {
      return res.status(404).json({ error: "not_found" });
    }
    const user = await prisma.user.findUnique({
      where: { id: req.user.id },
      select: { passwordHash: true },
    });
    const otherCount = await prisma.passkeyCredential.count({
      where: { userId: req.user.id, id: { not: id } },
    });
    const hasPassword = !!user?.passwordHash;
    if (!hasPassword && otherCount === 0) {
      return res
        .status(400)
        .json({ error: "cannot_delete_last_method", message: "Keep at least one login method." });
    }
    await prisma.passkeyCredential.delete({ where: { id } });
    return res.json({ ok: true });
  } catch (err) {
    logger.warn("Passkey delete failed", err);
    return res.status(400).json({ error: "passkey_delete_failed", message: err.message });
  }
});

export default router;
