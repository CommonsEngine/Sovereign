import { prisma } from "$/services/database.js";
import logger from "$/services/logger.js";
import {
  TOTP_PENDING_COOKIE,
  clearPending,
  clearPendingCookie,
  getPending,
  createPending,
  isTotpEnabled,
  setPendingCookie,
  verifyLoginTotp,
  useRecoveryCode,
} from "$/services/totp.js";
import { createSession } from "$/utils/auth.js";
import env from "$/config/env.js";

const { FEATURE_TOTP_ENABLED } = env();

export async function beginTotpChallenge(userId, res) {
  if (!(FEATURE_TOTP_ENABLED && userId)) return false;
  const enabled = await isTotpEnabled(userId);
  if (!enabled) return false;
  const pending = await createPending(userId);
  setPendingCookie(res, pending.token, pending.expiresAt);
  return true;
}

export async function verifyTotpLogin(req, res) {
  if (!FEATURE_TOTP_ENABLED) {
    return res.status(404).json({ error: "totp_disabled" });
  }
  const accept = String(req.headers["accept"] || "");
  const isFormContent = req.is("application/x-www-form-urlencoded") || accept.includes("text/html");
  try {
    const token =
      req.cookies?.[TOTP_PENDING_COOKIE] ||
      (typeof req.body?.pending_token === "string" ? req.body.pending_token : "");
    const pending = await getPending(token);
    if (!pending) {
      const errPayload = { error: "totp_pending_expired", message: "2FA session expired." };
      if (isFormContent) {
        return res.status(400).render("login", {
          error: errPayload.message,
          totp_mode: true,
          return_to: typeof req.body?.return_to === "string" ? req.body.return_to : "",
        });
      }
      return res.status(400).json(errPayload);
    }
    const user = await prisma.user.findUnique({
      where: { id: pending.userId },
      include: {
        primaryEmail: { select: { email: true, isVerified: true, id: true } },
        emails: true,
        roleAssignments: {
          include: { role: { include: { roleCapabilities: true } } },
        },
      },
    });
    if (!user) {
      await clearPending(token);
      const errPayload = { error: "user_not_found", message: "Account not found." };
      if (isFormContent) {
        return res.status(400).render("login", {
          error: errPayload.message,
          totp_mode: true,
          return_to: typeof req.body?.return_to === "string" ? req.body.return_to : "",
        });
      }
      return res.status(404).json(errPayload);
    }

    const code = typeof req.body?.code === "string" ? req.body.code : "";
    const recovery = typeof req.body?.recovery_code === "string" ? req.body.recovery_code : "";
    if (recovery) {
      await useRecoveryCode(user.id, recovery);
    } else {
      await verifyLoginTotp(user.id, code);
    }

    await clearPending(token);
    clearPendingCookie(res);
    await createSession(req, res, { ...user, sessionEmail: user.primaryEmail?.email });

    const dest =
      typeof req.body?.return_to === "string" && req.body.return_to.startsWith("/")
        ? req.body.return_to
        : "/";
    if (isFormContent) {
      return res.redirect(302, dest);
    }
    return res.json({ ok: true, redirect: dest });
  } catch (err) {
    logger.warn("TOTP login verification failed", err);
    const errPayload = {
      error: err.code || "totp_login_failed",
      message: err.message || "Invalid code",
    };
    if (isFormContent) {
      return res.status(400).render("login", {
        error: errPayload.message,
        totp_mode: true,
        return_to: typeof req.body?.return_to === "string" ? req.body.return_to : "",
      });
    }
    return res.status(400).json(errPayload);
  }
}
