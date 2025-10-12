function normalizeInputAllowed(v) {
  if (typeof v === "number") return String(v);
  if (typeof v === "string") return v.toLowerCase();
  return null;
}

function userHasAllowedRole(user, allowedSet) {
  if (!user || !allowedSet) return false;

  // If no restrictions specified, allow any authenticated user
  if (allowedSet.size === 0) return !!user;

  // prefer role snapshot if present
  const roleObj = user.role || null;
  if (!roleObj) return false; // not logged in

  // allow wildcard / any
  if (allowedSet.has("any") || allowedSet.has("*")) return true;

  // normalize candidates
  const roleId = roleObj.id !== undefined ? String(roleObj.id) : null;
  const roleKey = roleObj.key ? String(roleObj.key).toLowerCase() : null;
  const roleLabel = roleObj.label ? String(roleObj.label).toLowerCase() : null;

  if (roleId && allowedSet.has(roleId)) return true;
  if (roleKey && allowedSet.has(roleKey)) return true;
  if (roleLabel && allowedSet.has(roleLabel)) return true;

  // TODO: Extend this middleware to consider capabilities as well

  return false;
}

/**
 * Usage:
 * requireRole(["platform_admin","tenant_admin"]) -> allows only defined roles
 * requireRole(0) -> allows only platform_admin (id=0)
 * requireRole(["admin","editor"]) -> allows any user with role label "admin" or "editor"
 * requireRole("any") -> allows any authenticated user
 * requireRole() -> allows any authenticated user
 * Accepts:
 *  - role keys (e.g. "platform_admin", "tenant_admin")
 *  - numeric ids (0..n)
 */
export function requireRole(allowed = []) {
  const raw = Array.isArray(allowed) ? allowed : [allowed];
  const allowedSet = new Set(
    raw.map(normalizeInputAllowed).filter((v) => v !== null),
  );

  return function roleGuard(req, res, next) {
    if (!req.user) {
      if (req.path.startsWith("/api/") || req.path.startsWith("/auth/")) {
        return res.status(401).json({ error: "Unauthorized" });
      }
      return res.status(401).render("error", {
        code: 401,
        message: "Unauthorized",
        description: "Please sign in to continue.",
      });
    }

    // Check RBAC snapshot or legacy fields
    const allowed = userHasAllowedRole(req.user, allowedSet);
    if (!allowed) {
      if (req.path.startsWith("/api/") || req.path.startsWith("/auth/")) {
        return res.status(403).json({ error: "Forbidden" });
      }
      return res.status(403).render("error", {
        code: 403,
        message: "Forbidden",
        description: "You don’t have permission to perform this action.",
      });
    }

    return next();
  };
}
