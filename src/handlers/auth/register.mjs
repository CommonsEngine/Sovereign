import { hashPassword, randomToken } from "$/utils/auth.mjs";
import logger from "$/utils/logger.mjs";
import { sendMail } from "$/utils/mailer.mjs";
import env from "$/config/env.mjs";
import prisma from "$/prisma.mjs";
import { syncProjectPrimaryOwner } from "$/utils/projectAccess.mjs";

const { SIGNUP_POLICY, APP_URL, APP_NAME } = env();

const toAbsoluteUrl = (relativePath = "") => {
  const base = String(APP_URL || "").replace(/\/+$/, "");
  if (!relativePath) return base;
  if (/^https?:\/\//i.test(relativePath)) return relativePath;
  const normalized = relativePath.startsWith("/")
    ? relativePath
    : `/${relativePath}`;
  return `${base}${normalized}`;
};

export default async function register(req, res) {
  try {
    // Decide response mode: HTML form vs JSON API
    const accept = String(req.headers["accept"] || "");
    const isFormContent =
      req.is("application/x-www-form-urlencoded") ||
      accept.includes("text/html");

    // Pull fields (form may pass additional fields like confirm_password)
    const { first_name, last_name, email, password, confirm_password } =
      req.body || {};

    // Invite-only: require a valid invite token
    const token = String(req.query?.token || req.body?.token || "");

    // If invite-only and no token, reject
    if (SIGNUP_POLICY === "invite" && !token) {
      logger.log("Registration is by invitation only.");
      const msg = "Registration is by invitation only.";
      if (isFormContent) {
        return res.status(403).render("register", {
          error: msg,
          values: { first_name, last_name, email },
        });
      }
      return res.status(403).json({ error: msg });
    }

    logger.log("Register called with token:", token);

    if (token) {
      // Look up invite token
      const vt = await prisma.verificationToken.findUnique({
        where: { token },
      });

      const validInvite =
        !!vt &&
        vt.purpose === "invite" &&
        vt.expiresAt instanceof Date &&
        vt.expiresAt > new Date();

      if (!validInvite) {
        const msg = "Invalid or expired invite link.";
        if (isFormContent) {
          return res.status(400).render("register", {
            error: msg,
            values: { first_name, last_name, email },
          });
        }
        return res.status(400).json({ error: msg });
      }

      // Load invited user (include primaryEmail)
      const invitedUser = await prisma.user.findUnique({
        where: { id: vt.userId },
        select: {
          id: true,
          primaryEmail: { select: { id: true, email: true, isVerified: true } },
          name: true,
          firstName: true,
          lastName: true,
          passwordHash: true,
          status: true,
        },
      });

      if (!invitedUser) {
        if (isFormContent) {
          return res.status(400).render("register", {
            error: "Invalid invite.",
            values: { first_name, last_name, email },
          });
        }
        return res.status(400).json({ error: "Invalid invite" });
      }

      const emailNorm =
        typeof email === "string" ? email.trim().toLowerCase() : "";
      // If an email was provided, ensure it matches the invited primary email (if present)
      if (
        emailNorm &&
        invitedUser.primaryEmail?.email &&
        emailNorm !== invitedUser.primaryEmail.email
      ) {
        const msg = "Email does not match the invited account.";
        return isFormContent
          ? res.status(400).render("register", {
              error: msg,
              values: { first_name, last_name, email },
            })
          : res.status(400).json({ error: msg });
      }

      // Validate password strength
      const passStr = typeof password === "string" ? password : "";
      if (
        passStr.length < 6 ||
        !/[A-Za-z]/.test(passStr) ||
        !/\d/.test(passStr)
      ) {
        const msg =
          "Password must be at least 6 characters and include a letter and a number.";
        if (isFormContent) {
          return res.status(400).render("register", {
            error: msg,
            values: { first_name, last_name, email },
          });
        }
        return res.status(400).json({ error: "Password too weak" });
      }

      // If invited user lacks a primary email but an email was provided, create it and link
      let primaryEmailId = invitedUser.primaryEmail?.id;
      if (!primaryEmailId && emailNorm) {
        const createdEmail = await prisma.userEmail.create({
          data: {
            email: emailNorm,
            userId: invitedUser.id,
            isVerified: true,
            isPrimary: true,
          },
        });
        primaryEmailId = createdEmail.id;
        await prisma.user.update({
          where: { id: invitedUser.id },
          data: { primaryEmailId },
        });
      }

      // Hash password and update user: set password, activate, and optionally set names
      const passwordHash = await hashPassword(passStr);
      await prisma.user.update({
        where: { id: invitedUser.id },
        data: {
          passwordHash,
          status: "active",
          firstName:
            typeof first_name === "string" && first_name.trim()
              ? first_name.trim()
              : invitedUser.firstName,
          lastName:
            typeof last_name === "string" && last_name.trim()
              ? last_name.trim()
              : invitedUser.lastName,
        },
      });

      // Ensure primary email is marked verified
      if (primaryEmailId) {
        await prisma.userEmail.update({
          where: { id: primaryEmailId },
          data: { isVerified: true, isPrimary: true },
        });
      }

      // Consume invite token
      await prisma.verificationToken.delete({
        where: { token },
      });

      if (isFormContent) {
        return res.redirect(302, "/login?registered=1");
      }
      return res.status(201).json({ ok: true });
      // End of invite-only flow
    }

    // Normalize inputs
    const firstName = typeof first_name === "string" ? first_name.trim() : "";
    const lastName = typeof last_name === "string" ? last_name.trim() : "";
    const name = [firstName, lastName].join("_").toLowerCase();
    const emailNorm =
      typeof email === "string" ? email.trim().toLowerCase() : "";

    // Validate First name (required, 2–80 chars)
    if (firstName.length < 2 || firstName.length > 80) {
      if (isFormContent) {
        return res.status(400).render("register", {
          error: "First Name must be between 2 and 80 characters.",
          values: {
            first_name: firstName,
            last_name: lastName,
            email: emailNorm,
          },
        });
      }
      return res.status(400).json({ error: "Invalid first name" });
    }

    // Validate last name (required, 2–80 chars)
    if (lastName.length < 2 || lastName.length > 80) {
      if (isFormContent) {
        return res.status(400).render("register", {
          error: "Last Name must be between 2 and 80 characters.",
          values: {
            first_name: firstName,
            last_name: lastName,
            email: emailNorm,
          },
        });
      }
      return res.status(400).json({ error: "Invalid last name" });
    }

    // Validate username (required)
    // Rules: 3–24 chars, starts with a letter, then letters/numbers/._-
    const usernameOk =
      typeof name === "string" &&
      /^[A-Za-z][A-Za-z0-9._-]{2,23}$/.test(name || "");
    if (!usernameOk) {
      if (isFormContent) {
        return res.status(400).render("register", {
          error:
            "Choose a username (3–24 chars). Start with a letter; use letters, numbers, dot, underscore or hyphen.",
          values: {
            first_name: firstName,
            last_name: lastName,
            email: emailNorm,
          },
        });
      }
      return res
        .status(400)
        .json({ error: "Invalid username", code: "BAD_USERNAME" });
    }

    // Validate email
    if (
      typeof emailNorm !== "string" ||
      !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(emailNorm)
    ) {
      if (isFormContent) {
        return res.status(400).render("register", {
          error: "Please enter a valid email address.",
          values: {
            first_name: firstName,
            last_name: lastName,
            email: emailNorm,
          },
        });
      }
      return res.status(400).json({ error: "Invalid email" });
    }

    // Validate password: length ≥ 6 AND contains at least one letter and one number
    const passStr = typeof password === "string" ? password : "";
    if (
      passStr.length < 6 ||
      !/[A-Za-z]/.test(passStr) ||
      !/\d/.test(passStr)
    ) {
      if (isFormContent) {
        return res.status(400).render("register", {
          error:
            "Password must be at least 6 characters and include a letter and a number.",
          values: {
            first_name: firstName,
            last_name: lastName,
            email: emailNorm,
          },
        });
      }
      return res.status(400).json({ error: "Password too weak" });
    }

    // Confirm password (only checked for form flow; API clients can omit)
    if (
      isFormContent &&
      typeof confirm_password === "string" &&
      passStr !== confirm_password
    ) {
      return res.status(400).render("register", {
        error: "Passwords do not match.",
        values: {
          first_name: firstName,
          last_name: lastName,
          email: emailNorm,
        },
      });
    }

    // Uniqueness checks
    // const [existingEmail, existingUsername] = await Promise.all([
    //   prisma.user.findUnique({ where: { email: emailNorm } }).catch(() => null),
    //   prisma.user.findFirst({ where: { name } }).catch(() => null),
    // ]);
    const existingEmail = await prisma.userEmail
      .findUnique({ where: { email: emailNorm } })
      .catch(() => null);
    // if (existingUsername) {
    //   if (isFormContent) {
    //     return res.status(409).render("register", {
    //       error: "That username is taken. Please choose another.",
    //       values: { first_name: firstName, last_name: lastName, email: emailNorm },
    //     });
    //   }
    //   return res.status(409).json({ error: "Username already registered" });
    // }
    if (existingEmail) {
      if (isFormContent) {
        return res.status(409).render("register", {
          error: "That email is already registered.",
          values: {
            first_name: firstName,
            last_name: lastName,
            email: emailNorm,
          },
        });
      }
      return res.status(409).json({ error: "Email already registered" });
    }

    const passwordHash = await hashPassword(passStr);
    // 1) create user (without primaryEmailId)
    const user = await prisma.user.create({
      data: {
        name,
        firstName,
        lastName,
        passwordHash,
      },
      select: { id: true },
    });

    // 2) create user email and link to user
    const userEmail = await prisma.userEmail.create({
      data: {
        email: emailNorm,
        userId: user.id,
        isVerified: false,
        isPrimary: true,
      },
      select: { id: true },
    });

    // 3) set user's primaryEmailId to the created email id
    await prisma.user.update({
      where: { id: user.id },
      data: { primaryEmailId: userEmail.id },
    });

    // Assign guest role for this user (default)
    const guestUserRole = await prisma.userRole.findUnique({
      where: { key: "guest" },
    });
    if (guestUserRole) {
      await prisma.userRoleAssignment.upsert({
        where: {
          userId_roleId: { userId: user.id, roleId: guestUserRole.id },
        },
        update: {},
        create: { userId: user.id, roleId: guestUserRole.id },
      });
    }

    const pendingMemberships = await prisma.projectContributor.findMany({
      where: {
        invitedEmail: emailNorm,
        status: "pending",
      },
      select: {
        id: true,
        projectId: true,
        role: true,
      },
    });

    if (pendingMemberships.length) {
      const membershipIds = pendingMemberships.map((m) => m.id);
      await prisma.projectContributor.updateMany({
        where: { id: { in: membershipIds } },
        data: {
          userId: user.id,
          status: "active",
          acceptedAt: new Date(),
        },
      });

      const uniqueProjectIds = Array.from(
        new Set(pendingMemberships.map((m) => m.projectId)),
      );
      await Promise.all(
        uniqueProjectIds.map((projectId) => syncProjectPrimaryOwner(projectId)),
      );
    }

    // Optional: email verification token (kept consistent with existing API)
    const verificationToken = randomToken(32);
    await prisma.verificationToken.create({
      data: {
        userId: user.id,
        token: verificationToken,
        purpose: "email-verify",
        expiresAt: new Date(Date.now() + 1000 * 60 * 60 * 24), // 24h
      },
    });

    const verifyUrl = toAbsoluteUrl(`/auth/verify?token=${verificationToken}`);
    const displayName =
      `${firstName || ""} ${lastName || ""}`.trim() || emailNorm;
    const verifyText = [
      `Hi ${displayName},`,
      "",
      `Welcome to ${APP_NAME}!`,
      "Please verify your email address by clicking the link below:",
      "",
      verifyUrl,
      "",
      "The link expires in 24 hours.",
      "",
      "If you didn't create this account, you can ignore this email.",
    ].join("\n");
    const verifyHtml = `<p>Hi ${displayName},</p>
<p>Welcome to <strong>${APP_NAME}</strong>!</p>
<p>Please verify your email address by clicking the link below:</p>
<p><a href="${verifyUrl}" target="_blank" rel="noopener">Verify your email</a></p>
<p>The link expires in 24 hours.</p>
<p>If you didn't create this account, you can ignore this email.</p>`;

    const verificationMailResult = await sendMail({
      to: emailNorm,
      subject: `Verify your email for ${APP_NAME}`,
      text: verifyText,
      html: verifyHtml,
    });
    if (verificationMailResult.status === "failed") {
      logger.warn("Failed to send verification email", {
        email: emailNorm,
        error: verificationMailResult.error,
      });
    }

    if (isFormContent) {
      // HTML form flow → redirect to login with banner
      return res.redirect(302, "/login?registered=1");
    }
    // JSON API flow
    return res.status(201).json({ ok: true });
  } catch (e) {
    logger.error("/register error", e);
    const accept = String(req.headers["accept"] || "");
    const isFormContent =
      req.is("application/x-www-form-urlencoded") ||
      accept.includes("text/html");
    if (isFormContent) {
      return res.status(500).render("register", {
        error: "Registration failed. Please try again.",
        values: {
          first_name: String(req.body?.first_name || "").trim(),
          name: String(req.body?.username || ""),
          email: String(req.body?.email || "").toLowerCase(),
        },
      });
    }
    return res.status(500).json({ error: "Register failed" });
  }
}

export async function viewRegister(req, res) {
  // if URL param ?token=? is present, show invite registration mode
  // First validate the token, and if valid populate email and display name fields
  const token = typeof req.query.token === "string" ? req.query.token : "";

  if (SIGNUP_POLICY !== "open") {
    logger.log("Registration is by invitation only.");
    if (!token) {
      return res.redirect(302, "/login?signup_disabled=1");
    }
  }

  if (!token) {
    return res.status(403).render("register", {
      // error: "Registration is by invitation only.",
      values: { first_name: "", last_name: "", email: "" },
    });
  }

  try {
    const invite = await prisma.verificationToken.findUnique({
      where: { token },
      select: { userId: true, expiresAt: true, purpose: true },
    });

    const valid =
      !!invite &&
      invite.purpose === "invite" &&
      invite.expiresAt instanceof Date &&
      invite.expiresAt > new Date();

    if (!valid) {
      return res.status(400).render("register", {
        error: "Invalid or expired invite link.",
        values: { first_name: "", last_name: "", email: "" },
      });
    }

    // Load invited user and their primary email according to current schema
    const invitedUser = await prisma.user.findUnique({
      where: { id: invite.userId },
      select: {
        name: true,
        firstName: true,
        lastName: true,
        primaryEmail: { select: { email: true } },
      },
    });

    if (!invitedUser) {
      return res.status(400).render("register", {
        error: "Invalid invite.",
        values: { first_name: "", last_name: "", email: "" },
      });
    }

    // primary email (may be undefined)
    const email = invitedUser.primaryEmail?.email || "";

    // Prefill email (readonly in template) and display name if present
    return res.render("register", {
      invite_mode: true,
      token,
      success: "Invitation accepted. Please complete your registration.",
      values: {
        first_name: invitedUser.firstName || "",
        last_name: invitedUser.lastName || "",
        email,
      },
    });
  } catch (err) {
    return res.status(500).render("error", {
      code: 500,
      message: "Oops!",
      description: "Failed to load registration form",
      error: err?.message || String(err),
    });
  }
}
