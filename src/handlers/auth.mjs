import {
  hashPassword,
  verifyPassword,
  randomToken,
  createSession,
  createRandomGuestUser,
} from "../utils/auth.mjs";
import prisma from "../prisma.mjs";
import {
  SESSION_COOKIE,
  COOKIE_OPTS,
  GUEST_LOGIN_ENABLED,
  GUEST_LOGIN_ENABLED_BYPASS_LOGIN,
} from "../config.mjs";

export async function register(req, res) {
  try {
    // Decide response mode: HTML form vs JSON API
    const accept = String(req.headers["accept"] || "");
    const isFormContent =
      req.is("application/x-www-form-urlencoded") ||
      accept.includes("text/html");

    // Pull fields (form may pass additional fields like confirm_password)
    const { username, email, password, confirm_password } = req.body || {};

    // Normalize inputs
    const u = typeof username === "string" ? username.trim() : "";
    const emailNorm =
      typeof email === "string" ? email.trim().toLowerCase() : "";

    // Validate username (required)
    // Rules: 3–24 chars, starts with a letter, then letters/numbers/._-
    const usernameOk =
      typeof u === "string" && /^[A-Za-z][A-Za-z0-9._-]{2,23}$/.test(u || "");
    if (!usernameOk) {
      if (isFormContent) {
        return res.status(400).render("register", {
          error:
            "Choose a username (3–24 chars). Start with a letter; use letters, numbers, dot, underscore or hyphen.",
          values: { username: u, email: emailNorm },
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
          values: { username: u, email: emailNorm },
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
          values: { username: u, email: emailNorm },
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
        values: { username: u, email: emailNorm },
      });
    }

    // Uniqueness checks
    const [existingEmail, existingUsername] = await Promise.all([
      prisma.user.findUnique({ where: { email: emailNorm } }).catch(() => null),
      prisma.user.findFirst({ where: { username: u } }).catch(() => null),
    ]);
    if (existingUsername) {
      if (isFormContent) {
        return res.status(409).render("register", {
          error: "That username is taken. Please choose another.",
          values: { username: u, email: emailNorm },
        });
      }
      return res.status(409).json({ error: "Username already registered" });
    }
    if (existingEmail) {
      if (isFormContent) {
        return res.status(409).render("register", {
          error: "That email is already registered.",
          values: { username: u, email: emailNorm },
        });
      }
      return res.status(409).json({ error: "Email already registered" });
    }

    const passwordHash = await hashPassword(passStr);
    const user = await prisma.user.create({
      data: { username: u, email: emailNorm, passwordHash },
      select: { id: true },
    });

    // Optional: email verification token (kept consistent with existing API)
    const token = randomToken(32);
    await prisma.verificationToken.create({
      data: {
        userId: user.id,
        token,
        purpose: "email-verify",
        expiresAt: new Date(Date.now() + 1000 * 60 * 60 * 24), // 24h
      },
    });

    if (isFormContent) {
      // HTML form flow → redirect to login with banner
      return res.redirect(302, "/login?registered=1");
    }
    // JSON API flow
    return res.status(201).json({ ok: true });
  } catch (e) {
    console.error("/auth/register error", e);
    const accept = String(req.headers["accept"] || "");
    const isFormContent =
      req.is("application/x-www-form-urlencoded") ||
      accept.includes("text/html");
    if (isFormContent) {
      return res.status(500).render("register", {
        error: "Registration failed. Please try again.",
        values: {
          username: String(req.body?.username || ""),
          email: String(req.body?.email || "").toLowerCase(),
        },
      });
    }
    return res.status(500).json({ error: "Register failed" });
  }
}

export async function login(req, res) {
  try {
    const accept = String(req.headers["accept"] || "");
    const isFormContent =
      req.is("application/x-www-form-urlencoded") ||
      accept.includes("text/html");

    const { email, password, return_to } = req.body || {};
    const emailNorm =
      typeof email === "string" ? email.trim().toLowerCase() : "";
    const pwd = typeof password === "string" ? password : "";

    // Basic validations
    if (
      typeof emailNorm !== "string" ||
      !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(emailNorm) ||
      !pwd
    ) {
      if (isFormContent) {
        return res.status(400).render("login", {
          error: "Please enter a valid email and password.",
          values: { email: emailNorm },
          return_to: typeof return_to === "string" ? return_to : "",
        });
      }
      return res.status(400).json({ error: "Invalid payload" });
    }

    const user = await prisma.user.findUnique({
      where: { email: emailNorm },
    });
    if (!user) {
      if (isFormContent) {
        return res.status(401).render("login", {
          error: "Invalid email or password.",
          values: { email: emailNorm },
          return_to: typeof return_to === "string" ? return_to : "",
        });
      }
      return res.status(401).json({ error: "Invalid credentials" });
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

    await createSession(res, user, req);

    if (isFormContent) {
      const dest =
        typeof return_to === "string" && return_to.startsWith("/")
          ? return_to
          : "/";
      return res.redirect(302, dest);
    }
    return res.json({ ok: true });
  } catch (e) {
    console.error("/auth/login error", e);
    const accept = String(req.headers["accept"] || "");
    const isFormContent =
      req.is("application/x-www-form-urlencoded") ||
      accept.includes("text/html");
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
    await createSession(res, guest, req);
    return res.redirect(302, "/");
  } catch (e) {
    console.error("guestLogin error", e);
    return res.status(500).json({ error: "Guest login failed" });
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
    console.error("/auth/password/forgot error", e);
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
    console.error("/auth/password/reset error", e);
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
    const token = String(req.query.token || "");
    if (!token) return res.status(400).json({ error: "Missing token" });

    const vt = await prisma.verificationToken.findUnique({
      where: { token },
    });
    if (!vt || vt.expiresAt < new Date() || vt.purpose !== "email-verify") {
      return res.status(400).json({ error: "Invalid/expired token" });
    }
    await prisma.user.update({
      where: { id: vt.userId },
      data: { emailVerifiedAt: new Date() },
    });
    await prisma.verificationToken.delete({ where: { token } });
    res.json({ ok: true });
  } catch (e) {
    console.error("/auth/verify error", e);
    res.status(500).json({ error: "Verify failed" });
  }
}

export async function getCurrentUser(req, res) {
  return res.json({ user: req.user });
}

export async function logout(req, res) {
  try {
    const token = req.cookies?.[SESSION_COOKIE];
    if (token) {
      try {
        await prisma.session.delete({ where: { token } });
      } catch (error) {
        console.warn("Failed to delete session during logout", error);
      }
      res.clearCookie(SESSION_COOKIE, COOKIE_OPTS);
    }
  } catch (error) {
    console.error("Logout handler failed", error);
  }
  return res.redirect(302, "/login");
}
