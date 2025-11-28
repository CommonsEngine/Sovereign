import { getSessionWithUser, getOrCreateSingletonGuestUser, createSession } from "$/utils/auth.js";
import env from "$/config/env.js";
import { ensureTenantIds } from "$/utils/tenants.js";
import { getUserPluginSnapshot } from "$/services/user-plugins.js";

const {
  AUTH_SESSION_COOKIE_NAME,
  COOKIE_OPTS,
  GUEST_LOGIN_ENABLED,
  GUEST_LOGIN_ENABLED_BYPASS_LOGIN,
  DEFAULT_TENANT_ID,
} = env();

const EMPTY_PLUGIN_ACCESS = { enabled: [], disabled: [], plugins: [] };

export async function requireAuth(req, res, next) {
  const token = req.cookies?.[AUTH_SESSION_COOKIE_NAME];
  const session = await getSessionWithUser(token);

  const primaryEmail = session?.user?.primaryEmail?.email || null;
  const roles = Array.isArray(session?.user?.roles) ? session.user.roles : [];
  const capabilities = (session && session.user && session.user.capabilities) || {};
  const pluginAccess = session?.user?.pluginAccess || EMPTY_PLUGIN_ACCESS;

  if (req.path.startsWith("/api/") || req.path.startsWith("/auth/")) {
    // API Auth Block Starts here
    if (!session || !session.user) {
      res.clearCookie(AUTH_SESSION_COOKIE_NAME, COOKIE_OPTS);
      return res.status(401).json({ error: "Unauthorized" });
    }

    const tenantIds = ensureTenantIds(session.user?.tenantIds, DEFAULT_TENANT_ID);

    req.user = {
      id: session.userId,
      name: session.user.name,
      email: primaryEmail,
      primaryEmailId: session.user.primaryEmail?.id || session.user.primaryEmailId || null,
      roles,
      role: roles[0] || null,
      capabilities,
      tenantIds,
      plugins: pluginAccess.enabled || [],
      pluginAccess,
    };
    req.sessionToken = token;
    next();
  } else {
    // Web Auth Block Starts here
    if (!session) {
      if (GUEST_LOGIN_ENABLED && GUEST_LOGIN_ENABLED_BYPASS_LOGIN) {
        // Auto guest login (singleton)
        const guest = await getOrCreateSingletonGuestUser();
        await createSession(req, res, guest);
        const guestEmail = Array.isArray(guest.emails)
          ? guest.emails.find((e) => e.isPrimary)?.email || guest.emails[0]?.email
          : null;
        const guestEmailId = Array.isArray(guest.emails)
          ? guest.emails.find((e) => e.isPrimary)?.id || guest.emails[0]?.id
          : null;
        const tenantIds = ensureTenantIds([], DEFAULT_TENANT_ID);
        let guestPluginAccess = EMPTY_PLUGIN_ACCESS;
        try {
          guestPluginAccess = await getUserPluginSnapshot(guest.id);
        } catch {
          guestPluginAccess = EMPTY_PLUGIN_ACCESS;
        }

        req.user = {
          id: guest.id,
          name: guest.name,
          email: guestEmail || null,
          primaryEmailId: guestEmailId || guest.primaryEmailId || null,
          roles: [],
          role: null,
          capabilities: {},
          tenantIds,
          plugins: guestPluginAccess.enabled || [],
          pluginAccess: guestPluginAccess,
        };
        return next();
      }

      // Redirect to login
      res.clearCookie(AUTH_SESSION_COOKIE_NAME, COOKIE_OPTS);
      const returnTo = encodeURIComponent(req.originalUrl || "/");
      return res.redirect(302, `/login?return_to=${returnTo}`);
    } else {
      const tenantIds = ensureTenantIds(session.user?.tenantIds, DEFAULT_TENANT_ID);

      req.user = {
        id: session.userId,
        name: session.user.name,
        email: primaryEmail,
        primaryEmailId: session.user.primaryEmail?.id || session.user.primaryEmailId || null,
        roles,
        role: roles[0] || null,
        capabilities,
        tenantIds,
        plugins: pluginAccess.enabled || [],
        pluginAccess,
      };
      req.sessionToken = token;
      next();
    }
  }
}

// HTML-only: block login/register for already authed users
export async function disallowIfAuthed(req, res, next) {
  const token = req.cookies?.[AUTH_SESSION_COOKIE_NAME];
  const session = await getSessionWithUser(token);
  if (session) {
    const rt = typeof req.query.return_to === "string" ? req.query.return_to : "";
    const dest = rt && rt.startsWith("/") ? rt : "/";
    return res.redirect(302, dest);
  }
  if (GUEST_LOGIN_ENABLED && GUEST_LOGIN_ENABLED_BYPASS_LOGIN) {
    // Skip login page entirely, auto guest
    const guest = await getOrCreateSingletonGuestUser();
    await createSession(req, res, guest);
    return res.redirect(302, "/");
  }
  next();
}
