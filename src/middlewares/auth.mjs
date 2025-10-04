import {
  getSessionWithUser,
  getOrCreateSingletonGuestUser,
  createSession,
} from "../utils/auth.mjs";
import {
  SESSION_COOKIE,
  COOKIE_OPTS,
  GUEST_LOGIN_ENABLED,
  GUEST_LOGIN_ENABLED_BYPASS_LOGIN,
} from "../config.mjs";

export async function requireAuth(req, res, next) {
  const token = req.cookies?.[SESSION_COOKIE];
  const session = await getSessionWithUser(token);
  if (!session) {
    res.clearCookie(SESSION_COOKIE, COOKIE_OPTS);
    return res.status(401).json({ error: "Unauthorized" });
  }
  req.user = { id: session.userId, email: session.user.email };
  req.sessionToken = token;
  next();
}

// HTML-only: redirect to login if not authed
export async function requireAuthWeb(req, res, next) {
  const token = req.cookies?.[SESSION_COOKIE];
  const session = await getSessionWithUser(token);
  if (!session) {
    if (GUEST_LOGIN_ENABLED && GUEST_LOGIN_ENABLED_BYPASS_LOGIN) {
      // Auto guest login (singleton)
      const guest = await getOrCreateSingletonGuestUser();
      await createSession(res, guest, req);
      req.user = { id: guest.id, email: guest.email };
      return next();
    }

    // Redirect to login
    res.clearCookie(SESSION_COOKIE, COOKIE_OPTS);
    const returnTo = encodeURIComponent(req.originalUrl || "/");
    return res.redirect(302, `/login?return_to=${returnTo}`);
  } else {
    req.user = { id: session.userId, email: session.user.email };
    req.sessionToken = token;
    next();
  }
}

// HTML-only: block login/register for already authed users
export async function disallowIfAuthed(req, res, next) {
  const token = req.cookies?.[SESSION_COOKIE];
  const session = await getSessionWithUser(token);
  if (session) {
    const rt =
      typeof req.query.return_to === "string" ? req.query.return_to : "";
    const dest = rt && rt.startsWith("/") ? rt : "/";
    return res.redirect(302, dest);
  }
  if (GUEST_LOGIN_ENABLED && GUEST_LOGIN_ENABLED_BYPASS_LOGIN) {
    // Skip login page entirely, auto guest
    const guest = await getOrCreateSingletonGuestUser();
    await createSession(res, guest, req);
    return res.redirect(302, "/");
  }
  next();
}
