import crypto from "crypto";

import { hashPassword, randomToken } from "../../utils/auth.mjs";
import logger from "../../utils/logger.mjs";
import env from "../../config/env.mjs";
import prisma from "../../prisma.mjs";

const { APP_URL, AUTH_SESSION_COOKIE_NAME, COOKIE_OPTS } = env();

export { default as register, viewRegister } from "./register.mjs";
export { default as login, guestLogin, viewLogin } from "./login.mjs";

export async function inviteUser(req, res) {
  try {
    const { email, displayName, role } = req.body || {};
    if (!email || !displayName || !Number.isInteger(role)) {
      return res.status(400).json({ error: "Invalid payload" });
    }

    const username = displayName.toLowerCase().replace(/\s+/g, "_");

    // Create or find user as invited
    const user = await prisma.user.upsert({
      where: { email },
      update: { displayName, role, username },
      create: { email, displayName, role, status: "invited", username },
      select: {
        id: true,
        email: true,
        displayName: true,
        name: true,
        role: true,
      },
    });

    // Generate a one-time token (persist using your existing token model)
    const token = crypto.randomUUID().replace(/-/g, "");
    // Clear any previous invite tokens for this user
    await prisma.verificationToken.deleteMany({
      where: { userId: user.id, purpose: "invite" },
    });
    // Persist invite token (48h)
    await prisma.verificationToken.create({
      data: {
        userId: user.id,
        token,
        purpose: "invite",
        expiresAt: new Date(Date.now() + 1000 * 60 * 60 * 48),
      },
    });

    // Build invite URL that lands on your registration completion page
    const base = String(APP_URL).replace(/\/+$/, "");
    const inviteUrl = `${base}/register?token=${token}`;

    return res.status(201).json({ user, inviteUrl });
  } catch (err) {
    logger.error("Invite user failed:", err);
    return res.status(500).json({ error: "Failed to create user invite" });
  }
}

export async function forgotPassword(req, res) {
  try {
    const accept = String(req.headers["accept"] || "");
    const isFormContent =
      req.is("application/x-www-form-urlencoded") ||
      accept.includes("text/html");
    const { email } = req.body || {};
    const emailNorm =
      typeof email === "string" ? email.trim().toLowerCase() : "";

    if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(emailNorm)) {
      if (isFormContent) {
        return res.status(400).render("login", {
          error: "Please enter a valid email address.",
          forgot_mode: true,
          values: { email: emailNorm },
          return_to: "",
        });
      }
      return res.status(400).json({ error: "Invalid" });
    }

    let devResetUrl = "";
    const user = await prisma.user.findUnique({
      where: { email: emailNorm },
    });
    if (user) {
      const token = randomToken(32);
      await prisma.passwordResetToken.create({
        data: {
          userId: user.id,
          token,
          expiresAt: new Date(Date.now() + 1000 * 60 * 30), // 30m
        },
      });
      // In development, expose the reset link to speed up testing
      if (process.env.NODE_ENV !== "production") {
        devResetUrl = `/login?token=${token}`;
      }
      // TODO: send reset link `${process.env.APP_URL || ""}/login?token=${token}`
    }

    if (isFormContent) {
      return res.status(200).render("login", {
        success: "If that email exists, we've sent a reset link.",
        forgot_mode: true,
        dev_reset_url: devResetUrl,
        values: { email: emailNorm },
        return_to: "",
      });
    }
    return res.json({ ok: true });
  } catch (e) {
    logger.error("/auth/password/forgot error", e);
    const accept = String(req.headers["accept"] || "");
    const isFormContent =
      req.is("application/x-www-form-urlencoded") ||
      accept.includes("text/html");
    if (isFormContent) {
      return res.status(500).render("login", {
        error: "Failed to process request.",
        forgot_mode: true,
        values: { email: String(req.body?.email || "").toLowerCase() },
        return_to: "",
      });
    }
    res.status(500).json({ error: "Failed" });
  }
}

export async function resetPassword(req, res) {
  try {
    const accept = String(req.headers["accept"] || "");
    const isFormContent =
      req.is("application/x-www-form-urlencoded") ||
      accept.includes("text/html");
    const { token, password, confirm_password } = req.body || {};
    const tkn = typeof token === "string" ? token : "";
    const pwd = typeof password === "string" ? password : "";

    if (!tkn) {
      if (isFormContent) {
        return res.status(400).render("login", {
          error: "Missing or invalid reset token.",
          reset_mode: true,
          token: "",
        });
      }
      return res.status(400).json({ error: "Invalid" });
    }
    if (pwd.length < 6 || !/[A-Za-z]/.test(pwd) || !/\d/.test(pwd)) {
      if (isFormContent) {
        return res.status(400).render("login", {
          error:
            "Password must be at least 6 characters and include a letter and a number.",
          reset_mode: true,
          token: tkn,
        });
      }
      return res.status(400).json({ error: "Weak password" });
    }
    if (
      isFormContent &&
      typeof confirm_password === "string" &&
      pwd !== confirm_password
    ) {
      return res.status(400).render("login", {
        error: "Passwords do not match.",
        reset_mode: true,
        token: tkn,
      });
    }

    const t = await prisma.passwordResetToken.findUnique({
      where: { token: tkn },
    });
    if (!t || t.expiresAt < new Date()) {
      if (isFormContent) {
        return res.status(400).render("login", {
          error: "Invalid or expired reset link.",
          reset_mode: false,
          forgot_mode: true,
        });
      }
      return res.status(400).json({ error: "Invalid/expired token" });
    }

    const passwordHash = await hashPassword(pwd);
    await prisma.user.update({
      where: { id: t.userId },
      data: { passwordHash },
    });
    await prisma.passwordResetToken.delete({ where: { token: tkn } });

    if (isFormContent) {
      return res.redirect(302, "/login?reset=1");
    }
    return res.json({ ok: true });
  } catch (e) {
    logger.error("/auth/password/reset error", e);
    const accept = String(req.headers["accept"] || "");
    const isFormContent =
      req.is("application/x-www-form-urlencoded") ||
      accept.includes("text/html");
    if (isFormContent) {
      return res.status(500).render("login", {
        error: "Failed to reset password. Please try again.",
        reset_mode: true,
        token: String(req.body?.token || ""),
      });
    }
    res.status(500).json({ error: "Failed" });
  }
}

export async function verifyToken(req, res) {
  try {
    const accept = String(req.headers["accept"] || "");
    const wantsHtml =
      accept.includes("text/html") || !accept.includes("application/json");

    const token = String(req.query.token || "");
    if (!token) {
      if (wantsHtml) {
        return res
          .status(400)
          .render("verify", { ok: false, error: "Missing token" });
      }
      return res.status(400).json({ error: "Missing token" });
    }

    const vt = await prisma.verificationToken.findUnique({ where: { token } });

    if (!vt || vt.expiresAt < new Date() || vt.purpose !== "email-verify") {
      if (wantsHtml) {
        return res
          .status(400)
          .render("verify", { ok: false, error: "Invalid or expired link." });
      }
      return res.status(400).json({ error: "Invalid/expired token" });
    }

    await prisma.user.update({
      where: { id: vt.userId },
      data: {
        emailVerifiedAt: new Date(),
        // Promote to active on verify if not already
        status: "active",
      },
    });
    await prisma.verificationToken.delete({ where: { token } });

    if (wantsHtml) {
      return res.render("auth/verify-token", {
        ok: true,
        message: "Your email has been verified.",
      });
    }
    return res.json({ ok: true });
  } catch (e) {
    logger.error("/auth/verify error", e);
    const accept = String(req.headers["accept"] || "");
    const wantsHtml =
      accept.includes("text/html") || !accept.includes("application/json");
    if (wantsHtml) {
      return res
        .status(500)
        .render("verify", { ok: false, error: "Verification failed." });
    }
    return res.status(500).json({ error: "Verify failed" });
  }
}

export async function getCurrentUser(req, res) {
  return res.json({ user: req.user });
}

export async function logout(req, res) {
  try {
    const token = req.cookies?.[AUTH_SESSION_COOKIE_NAME];
    if (token) {
      try {
        await prisma.session.delete({ where: { token } });
      } catch (error) {
        logger.warn("Failed to delete session during logout", error);
      }
      res.clearCookie(AUTH_SESSION_COOKIE_NAME, COOKIE_OPTS);
    }
  } catch (error) {
    logger.error("Logout handler failed", error);
  }
  return res.redirect(302, "/login");
}
