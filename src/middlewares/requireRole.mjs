const CAPABILITY_PREFIX = "cap:";

function normalizeAllowedValue(value) {
  if (typeof value === "number") return String(value);
  if (typeof value === "string") return value.trim().toLowerCase();
  return null;
}

function splitAllowedSet(allowedSet) {
  const roles = new Set();
  const capabilities = new Set();

  for (const entry of allowedSet) {
    if (!entry) continue;
    if (entry.startsWith(CAPABILITY_PREFIX)) {
      const key = entry.slice(CAPABILITY_PREFIX.length);
      if (key) capabilities.add(key);
      continue;
    }
    roles.add(entry);
  }

  return { roles, capabilities };
}

function userHasRole(user, allowedRoles, allowIfEmpty = true) {
  if (!user || !allowedRoles) return false;
  if (allowedRoles.size === 0) return allowIfEmpty ? !!user : false;

  if (allowedRoles.has("any") || allowedRoles.has("*")) return true;

  const roleCandidates = [];
  if (Array.isArray(user.roles) && user.roles.length > 0) {
    roleCandidates.push(...user.roles);
  }
  if (user.role) {
    roleCandidates.push(user.role);
  }

  if (roleCandidates.length === 0) return false;

  for (const roleObj of roleCandidates) {
    if (!roleObj) continue;
    const roleId = roleObj.id !== undefined ? String(roleObj.id) : null;
    const roleKey = roleObj.key ? String(roleObj.key).toLowerCase() : null;
    const roleLabel = roleObj.label
      ? String(roleObj.label).toLowerCase()
      : null;

    if (roleId && allowedRoles.has(roleId)) return true;
    if (roleKey && allowedRoles.has(roleKey)) return true;
    if (roleLabel && allowedRoles.has(roleLabel)) return true;
  }

  return false;
}

function userHasCapability(user, allowedCapabilities) {
  if (!user || !allowedCapabilities || allowedCapabilities.size === 0) {
    return false;
  }

  const caps = user.capabilities || {};
  const precedence = {
    allow: 5,
    consent: 4,
    compliance: 3,
    scoped: 2,
    anonymized: 2,
    deny: 1,
  };

  for (const key of allowedCapabilities) {
    const value = caps[key];
    if (!value) continue;
    if ((precedence[value] || 0) > precedence.deny) return true;
  }

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
export default function requireRole(allowed = []) {
  const raw = Array.isArray(allowed) ? allowed : [allowed];
  const allowedSet = new Set(
    raw.map(normalizeAllowedValue).filter((v) => v !== null),
  );
  const { roles: allowedRoles, capabilities: allowedCaps } =
    splitAllowedSet(allowedSet);
  const allowRolesIfEmpty = allowedCaps.size === 0;

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

    const roleAllowed = userHasRole(req.user, allowedRoles, allowRolesIfEmpty);
    const capabilityAllowed = userHasCapability(req.user, allowedCaps);

    if (!roleAllowed && !capabilityAllowed) {
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
