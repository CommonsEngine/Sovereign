import { prisma } from "$/services/database.js";
import logger from "$/services/logger.js";
import { verifyPassword, createSession, createRandomGuestUser } from "$/utils/auth.js";
import env from "$/config/env.js";

const {
  GUEST_LOGIN_ENABLED,
  GUEST_LOGIN_ENABLED_BYPASS_LOGIN,
  SIGNUP_POLICY,
  FEATURE_PASSKEYS_ENABLED,
} = env();

export default async function login(req, res) {
  try {
    const accept = String(req.headers["accept"] || "");
    const isFormContent =
      req.is("application/x-www-form-urlencoded") || accept.includes("text/html");

    const { email, password, return_to } = req.body || {};
    const emailNorm = typeof email === "string" ? email.trim().toLowerCase() : "";
    const pwd = typeof password === "string" ? password : "";

    // Basic validations
    if (typeof emailNorm !== "string" || !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(emailNorm) || !pwd) {
      if (isFormContent) {
        return res.status(400).render("login", {
          error: "Please enter a valid email and password.",
          values: { email: emailNorm },
          return_to: typeof return_to === "string" ? return_to : "",
        });
      }
      return res.status(400).json({ error: "Invalid payload" });
    }

    // Lookup user via UserEmail (schema change: email moved to UserEmail)
    const userEmailRec = await prisma.userEmail.findUnique({
      where: { email: emailNorm },
      select: {
        id: true,
        email: true,
        isVerified: true,
        user: {
          select: {
            id: true,
            name: true,
            status: true,
            passwordHash: true,
            primaryEmailId: true,
            primaryEmail: {
              select: { id: true, email: true, isVerified: true },
            },
            roleAssignments: {
              select: {
                id: true,
                role: {
                  select: {
                    id: true,
                    key: true,
                    label: true,
                    level: true,
                    scope: true,
                    roleCapabilities: {
                      select: {
                        capabilityKey: true,
                        value: true,
                        capability: {
                          select: { key: true, description: true },
                        },
                      },
                    },
                  },
                },
              },
            },
          },
        },
      },
    });

    // require an email record, linked user, and a verified email for login
    if (!userEmailRec || !userEmailRec.user || !userEmailRec.user.status === "active") {
      if (isFormContent) {
        return res.status(401).render("login", {
          error: "Invalid email or password.",
          values: { email: emailNorm },
          return_to: typeof return_to === "string" ? return_to : "",
        });
      }
      return res.status(401).json({ error: "Invalid credentials" });
    }

    const user = userEmailRec.user;

    // Active-only login
    const status = String(user.status || "").toLowerCase();
    if (status !== "active") {
      if (isFormContent) {
        return res.status(403).render("login", {
          error:
            status === "invited"
              ? "Your account is not activated yet. Please use the invite link to complete setup."
              : "Your account is inactive. Please contact an administrator.",
          values: { email: emailNorm },
          return_to: typeof return_to === "string" ? return_to : "",
        });
      }
      return res.status(403).json({ error: "Account inactive" });
    }

    // Block login if password not set yet (invited/initialized accounts)
    if (!user.passwordHash) {
      const accept = String(req.headers["accept"] || "");
      const isFormContent =
        req.is("application/x-www-form-urlencoded") || accept.includes("text/html");
      const msg =
        "Your account is not fully set up. Please use the invite/verification link to set your password.";
      if (isFormContent) {
        return res.status(403).render("login", {
          error: msg,
          values: {
            email: String(req.body?.email || "")
              .toLowerCase()
              .trim(),
          },
          return_to: typeof req.body?.return_to === "string" ? req.body.return_to : "",
        });
      }
      return res.status(403).json({ error: "Password not set" });
    }

    const ok = await verifyPassword(user.passwordHash, pwd);
    if (!ok) {
      if (isFormContent) {
        return res.status(401).render("login", {
          error: "Invalid email or password.",
          values: { email: emailNorm },
          return_to: typeof return_to === "string" ? return_to : "",
        });
      }
      return res.status(401).json({ error: "Invalid credentials" });
    }

    await createSession(req, res, {
      ...user,
      sessionEmail: userEmailRec.email,
      sessionEmailId: userEmailRec.id,
    });

    if (isFormContent) {
      const dest = typeof return_to === "string" && return_to.startsWith("/") ? return_to : "/";
      return res.redirect(302, dest);
    }
    return res.json({ ok: true });
  } catch (err) {
    logger.error("✗ /login error", err);
    const accept = String(req.headers["accept"] || "");
    const isFormContent =
      req.is("application/x-www-form-urlencoded") || accept.includes("text/html");
    if (isFormContent) {
      return res.status(500).render("login", {
        error: "Login failed. Please try again.",
        values: { email: String(req.body?.email || "").toLowerCase() },
        return_to: String(req.body?.return_to || ""),
      });
    }
    return res.status(500).json({ error: "Login failed" });
  }
}

export async function guestLogin(req, res) {
  if (!(GUEST_LOGIN_ENABLED && !GUEST_LOGIN_ENABLED_BYPASS_LOGIN)) {
    return res.status(404).json({ error: "Disabled" });
  }
  try {
    const guest = await createRandomGuestUser();
    await createSession(req, res, guest);
    return res.redirect(302, "/");
  } catch (err) {
    logger.error("✗ guestLogin error", err);
    return res.status(500).json({ error: "Guest login failed" });
  }
}

export async function viewLogin(req, res) {
  if (GUEST_LOGIN_ENABLED && GUEST_LOGIN_ENABLED_BYPASS_LOGIN) {
    return res.redirect(302, "/");
  }
  const justRegistered = String(req.query.registered || "") === "1";
  const justReset = String(req.query.reset || "") === "1";
  const returnTo = typeof req.query.return_to === "string" ? req.query.return_to : "";
  const forgotMode = String(req.query.forgot || "") === "1";
  const token = typeof req.query.token === "string" ? req.query.token : "";
  const resetMode = !!token;
  return res.render("login", {
    success: justRegistered
      ? "Account created. Please sign in."
      : justReset
        ? "Password updated. Please sign in."
        : null,
    return_to: returnTo,
    forgot_mode: forgotMode && !resetMode,
    reset_mode: resetMode,
    token,
    guest_enabled: GUEST_LOGIN_ENABLED && !GUEST_LOGIN_ENABLED_BYPASS_LOGIN,
    allow_signup: SIGNUP_POLICY === "open",
    passkeys_enabled: FEATURE_PASSKEYS_ENABLED,
  });
}
