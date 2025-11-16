import crypto from "crypto";

import { prisma } from "$/services/database.js";
import { sendMail } from "$/services/mailer.js";
import logger from "$/services/logger.js";
import { hashPassword, randomToken } from "$/utils/auth.js";
import { isGuestUser, purgeGuestUserById } from "$/utils/guestCleanup.js";
import env from "$/config/env.js";

const { APP_URL, AUTH_SESSION_COOKIE_NAME, COOKIE_OPTS, APP_NAME } = env();
const PLATFORM_USER_ROLE_ID = 3;

const toAbsoluteUrl = (relativePath = "") => {
  const base = String(APP_URL || "").replace(/\/+$/, "");
  if (!relativePath) return base;
  if (/^https?:\/\//i.test(relativePath)) return relativePath;
  const normalized = relativePath.startsWith("/") ? relativePath : `/${relativePath}`;
  return `${base}${normalized}`;
};

export { default as register, viewRegister } from "./register.js";
export { default as login, guestLogin, viewLogin } from "./login.js";

export async function inviteUser(req, res) {
  try {
    const { email, displayName, role } = req.body || {};
    if (!email || !displayName || role === undefined || role === null) {
      return res.status(400).json({ error: "Invalid payload" });
    }

    const emailNorm = String(email).trim().toLowerCase();
    if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(emailNorm)) {
      return res.status(400).json({ error: "Invalid email" });
    }

    const names = String(displayName || "")
      .trim()
      .split(/\s+/);
    const firstName = names.shift() || "";
    const lastName = names.join(" ") || "";

    // Resolve role input: allow numeric id or role name string
    let roleId = null;
    if (typeof role === "number" && Number.isInteger(role)) {
      roleId = role;
    } else if (typeof role === "string" && /^\d+$/.test(role)) {
      roleId = Number(role);
    } else if (typeof role === "string") {
      // Resolve by key (preferred) or label (case-insensitive)
      let roleRec = await prisma.userRole.findUnique({ where: { key: role } });
      if (!roleRec) {
        roleRec = await prisma.userRole.findFirst({
          where: {
            OR: [
              { key: { equals: role, mode: "insensitive" } },
              { label: { equals: role, mode: "insensitive" } },
            ],
          },
        });
      }
      if (!roleRec) return res.status(400).json({ error: "Unknown role" });
      roleId = roleRec.id;
    } else {
      return res.status(400).json({ error: "Invalid role" });
    }

    // ensure roleId is an integer now
    if (!Number.isInteger(roleId)) return res.status(400).json({ error: "Invalid role" });

    // Try to find an existing user by email
    const existingEmail = await prisma.userEmail.findUnique({
      where: { email: emailNorm },
      include: { user: true },
    });

    let user = null;

    if (existingEmail && existingEmail.user) {
      // Update user details without clobbering the unique 'name' field
      const updates = {};
      if (!existingEmail.user.firstName && firstName) updates.firstName = firstName;
      if (!existingEmail.user.lastName && lastName) updates.lastName = lastName;
      // only set status to invited if user is not already active
      if (existingEmail.user.status !== "active") updates.status = "invited";

      if (Object.keys(updates).length > 0) {
        user = await prisma.user.update({
          where: { id: existingEmail.user.id },
          data: updates,
          select: {
            id: true,
            name: true,
            firstName: true,
            lastName: true,
            status: true,
            primaryEmail: { select: { email: true } },
          },
        });
      } else {
        user = await prisma.user.findUnique({
          where: { id: existingEmail.user.id },
          select: {
            id: true,
            name: true,
            firstName: true,
            lastName: true,
            status: true,
            primaryEmail: { select: { email: true } },
          },
        });
      }
    } else {
      // Create a unique user.name (slug) based on displayName
      const baseName = String(displayName)
        .trim()
        .toLowerCase()
        .replace(/\s+/g, "_")
        .replace(/[^a-z0-9_]/g, "");
      let candidate = baseName || `user_${Math.floor(Math.random() * 10000)}`;
      let suffix = 0;
      // Ensure uniqueness of name
      // Note: small loop, fine for invites
      while (await prisma.user.findUnique({ where: { name: candidate } })) {
        suffix += 1;
        candidate = `${baseName}_${suffix}`;
      }

      const createdUser = await prisma.user.create({
        data: {
          name: candidate,
          firstName: firstName || null,
          lastName: lastName || null,
          status: "invited",
        },
      });

      const createdEmail = await prisma.userEmail.create({
        data: {
          userId: createdUser.id,
          email: emailNorm,
          isPrimary: true,
          isVerified: false,
        },
      });

      // set primaryEmailId on user
      await prisma.user.update({
        where: { id: createdUser.id },
        data: { primaryEmailId: createdEmail.id },
      });

      user = await prisma.user.findUnique({
        where: { id: createdUser.id },
        select: {
          id: true,
          name: true,
          firstName: true,
          lastName: true,
          status: true,
          primaryEmail: { select: { email: true } },
        },
      });
    }

    // Assign role via UserRoleAssignment (idempotent)
    try {
      await prisma.userRoleAssignment.upsert({
        where: { userId_roleId: { userId: user.id, roleId } },
        create: { userId: user.id, roleId },
        update: {}, // nothing to change if exists
      });
    } catch {
      // If upsert fails because composite unique key naming differs, fallback to safe create if not exists
      // ignore unique constraint errors
      try {
        const exists = await prisma.userRoleAssignment.findFirst({
          where: { userId: user.id, roleId },
        });
        if (!exists) {
          await prisma.userRoleAssignment.create({
            data: { userId: user.id, roleId },
          });
        }
      } catch (e) {
        logger.warn("Failed to assign role during invite", e);
      }
    }

    // Always ensure platform:user assignment alongside any role
    try {
      await prisma.userRoleAssignment.upsert({
        where: { userId_roleId: { userId: user.id, roleId: PLATFORM_USER_ROLE_ID } },
        create: { userId: user.id, roleId: PLATFORM_USER_ROLE_ID },
        update: {},
      });
    } catch {
      try {
        const exists = await prisma.userRoleAssignment.findFirst({
          where: { userId: user.id, roleId: PLATFORM_USER_ROLE_ID },
        });
        if (!exists) {
          await prisma.userRoleAssignment.create({
            data: { userId: user.id, roleId: PLATFORM_USER_ROLE_ID },
          });
        }
      } catch (e) {
        logger.warn("Failed to assign platform:user role during invite", e);
      }
    }

    // Generate a one-time token and persist (clean previous invite tokens)
    const token = crypto.randomUUID().replace(/-/g, "");
    await prisma.verificationToken.deleteMany({
      where: { userId: user.id, purpose: "invite" },
    });
    await prisma.verificationToken.create({
      data: {
        userId: user.id,
        token,
        purpose: "invite",
        expiresAt: new Date(Date.now() + 1000 * 60 * 60 * 48),
      },
    });

    // Build invite URL
    const inviteUrl = toAbsoluteUrl(`/register?token=${token}`);

    const safeDisplayName = String(displayName || "").trim() || emailNorm;
    const inviteSubject = `${APP_NAME} invitation`;
    const inviteText = [
      `Hi ${safeDisplayName},`,
      "",
      `You've been invited to join ${APP_NAME}.`,
      "Use the link below to finish setting up your account:",
      "",
      inviteUrl,
      "",
      "This link expires in 48 hours.",
      "",
      "If you didn't expect this invitation, you can ignore this email.",
    ].join("\n");
    const inviteHtml = `<p>Hi ${safeDisplayName},</p>
<p>You've been invited to join <strong>${APP_NAME}</strong>.</p>
<p>Use the link below to finish setting up your account:</p>
<p><a href="${inviteUrl}" target="_blank" rel="noopener">Accept your invite</a></p>
<p>This link expires in 48 hours.</p>
<p>If you didn't expect this invitation, you can ignore this email.</p>`;

    const inviteMailResult = await sendMail({
      to: emailNorm,
      subject: inviteSubject,
      text: inviteText,
      html: inviteHtml,
    });

    if (inviteMailResult.status === "failed") {
      logger.warn("Failed to send invite email", {
        email: emailNorm,
        error: inviteMailResult.error,
      });
    }

    // Return user + invite URL (include primary email)
    return res.status(201).json({
      user: {
        id: user.id,
        name: user.name,
        firstName: user.firstName,
        lastName: user.lastName,
        email: user.primaryEmail?.email || emailNorm,
        status: user.status,
      },
      inviteUrl,
    });
  } catch (err) {
    logger.error("✗ Invite user failed:", err);
    return res.status(500).json({ error: "Failed to create user invite" });
  }
}

export async function forgotPassword(req, res) {
  try {
    const accept = String(req.headers["accept"] || "");
    const isFormContent =
      req.is("application/x-www-form-urlencoded") || accept.includes("text/html");
    const { email } = req.body || {};
    const emailNorm = typeof email === "string" ? email.trim().toLowerCase() : "";

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
    // Look up by UserEmail (schema: emails live in UserEmail)
    const userEmail = await prisma.userEmail.findUnique({
      where: { email: emailNorm },
      include: { user: true },
    });

    if (userEmail && userEmail.user) {
      const token = randomToken(32);
      await prisma.passwordResetToken.create({
        data: {
          userId: userEmail.user.id,
          token,
          expiresAt: new Date(Date.now() + 1000 * 60 * 30), // 30m
        },
      });
      const resetUrl = toAbsoluteUrl(`/login?token=${token}`);
      const resetText = [
        `Hi ${userEmail.user.firstName || userEmail.user.name || emailNorm || "there"},`,
        "",
        `We received a request to reset your ${APP_NAME} password.`,
        "Use the link below to choose a new password:",
        "",
        resetUrl,
        "",
        "This link expires in 30 minutes.",
        "",
        "If you didn't request a password reset, you can ignore this email.",
      ].join("\n");
      const resetHtml = `<p>Hi ${userEmail.user.firstName || userEmail.user.name || emailNorm || "there"},</p>
<p>We received a request to reset your <strong>${APP_NAME}</strong> password.</p>
<p>Use the link below to choose a new password:</p>
<p><a href="${resetUrl}" target="_blank" rel="noopener">Reset your password</a></p>
<p>This link expires in 30 minutes.</p>
<p>If you didn't request a password reset, you can ignore this email.</p>`;

      const resetMailResult = await sendMail({
        to: emailNorm,
        subject: `Reset your ${APP_NAME} password`,
        text: resetText,
        html: resetHtml,
      });
      if (resetMailResult.status === "failed") {
        logger.warn("Failed to send password reset email", {
          email: emailNorm,
          error: resetMailResult.error,
        });
      }
      // In development, expose the reset link to speed up testing
      if (process.env.NODE_ENV !== "production") {
        devResetUrl = `/login?token=${token}`;
      }
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
  } catch (err) {
    logger.error("✗ /auth/password/forgot error", err);
    const accept = String(req.headers["accept"] || "");
    const isFormContent =
      req.is("application/x-www-form-urlencoded") || accept.includes("text/html");
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
      req.is("application/x-www-form-urlencoded") || accept.includes("text/html");
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
          error: "Password must be at least 6 characters and include a letter and a number.",
          reset_mode: true,
          token: tkn,
        });
      }
      return res.status(400).json({ error: "Weak password" });
    }
    if (isFormContent && typeof confirm_password === "string" && pwd !== confirm_password) {
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
  } catch (err) {
    logger.error("✗ /auth/password/reset error", err);
    const accept = String(req.headers["accept"] || "");
    const isFormContent =
      req.is("application/x-www-form-urlencoded") || accept.includes("text/html");
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
    const wantsHtml = accept.includes("text/html") || !accept.includes("application/json");

    const token = String(req.query.token || "");
    if (!token) {
      if (wantsHtml) {
        return res.status(400).render("verify", { ok: false, error: "Missing token" });
      }
      return res.status(400).json({ error: "Missing token" });
    }

    const vt = await prisma.verificationToken.findUnique({ where: { token } });

    if (!vt || vt.expiresAt < new Date() || vt.purpose !== "email-verify") {
      if (wantsHtml) {
        return res
          .status(400)
          .render("auth/verify-token", { ok: false, error: "Invalid or expired link." });
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
    // TODO: This need to take based on process.env.DEFAULT_USER_ROLE;
    const roleId = 3;
    await prisma.userRoleAssignment.upsert({
      where: { userId_roleId: { userId: vt.userId, roleId } },
      create: { userId: vt.userId, roleId },
      update: {}, // nothing to change if exists
    });
    // TODO: Update userEmail.isVerifeid too
    await prisma.verificationToken.delete({ where: { token } });

    if (wantsHtml) {
      return res.render("auth/verify-token", {
        ok: true,
        message: "Your email has been verified.",
      });
    }
    return res.json({ ok: true });
  } catch (err) {
    logger.error("✗ /auth/verify error", err);
    const accept = String(req.headers["accept"] || "");
    const wantsHtml = accept.includes("text/html") || !accept.includes("application/json");
    if (wantsHtml) {
      return res.status(500).render("verify", { ok: false, error: "Verification failed." });
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
    let sessionUser = null;

    if (token) {
      try {
        const session = await prisma.session.findUnique({
          where: { token },
          select: {
            userId: true,
            user: {
              select: {
                id: true,
                name: true,
                primaryEmail: { select: { email: true } },
                emails: { select: { email: true } },
              },
            },
          },
        });
        sessionUser = session?.user ?? null;
      } catch (error) {
        logger.warn("Failed to load session during logout", error);
      }

      try {
        await prisma.session.delete({ where: { token } });
      } catch (error) {
        logger.warn("Failed to delete session during logout", error);
      }
      res.clearCookie(AUTH_SESSION_COOKIE_NAME, COOKIE_OPTS);
    }

    if (sessionUser && isGuestUser(sessionUser)) {
      try {
        await purgeGuestUserById(sessionUser.id, { logger });
      } catch (error) {
        logger.warn("Guest cleanup failed during logout", { userId: sessionUser.id, error });
      }
    }
  } catch (err) {
    logger.error("✗ Logout handler failed", err);
  }
  return res.redirect(302, "/login");
}
