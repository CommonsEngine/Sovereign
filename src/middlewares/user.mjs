// Map numeric roles to labels (owner optionally as 0)
const ROLE_MAP = new Map([
  [0, "owner"],
  [1, "admin"],
  [2, "editor"],
  [3, "contributor"],
  [4, "viewer"],
  [9, "guest"],
]);

function normalizeRoleValue(r) {
  if (typeof r === "string") return r.toLowerCase();
  if (typeof r === "number") return ROLE_MAP.get(r) || null;
  return null;
}

function getUserRoleLabel(user) {
  if (!user) return null;
  // Treat isOwner as a super-role if present
  if (user.isOwner === true) return "owner";

  // TODO: clean up these legacy fields at some point
  const raw =
    user.roleLabel ??
    user.role_name ??
    user.roleName ??
    user.role ??
    user.roleId ??
    user.role_id;

  return normalizeRoleValue(raw);
}

/**
 * requireRole(["owner","admin"]) -> allows only Owner or Admin
 * requireRole(1) or requireRole(["admin"]) -> allows Admin
 * Pass strings (owner, admin, editor, contributor, viewer) or numeric ids (0..4).
 */
export function requireRole(allowed = []) {
  const allowedSet = new Set(
    (Array.isArray(allowed) ? allowed : [allowed])
      .filter((v) => v !== undefined && v !== null)
      .map(normalizeRoleValue)
      .filter(Boolean),
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

    const role = getUserRoleLabel(req.user);
    if (!role || !allowedSet.has(role)) {
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

export function roleLabelFrom(user) {
  if (!user) return null;
  if (user.isOwner === true) return "owner";
  const raw =
    user.roleLabel ??
    user.role_name ??
    user.roleName ??
    user.role ??
    user.roleId ??
    user.role_id;
  if (typeof raw === "string") return raw.toLowerCase();
  if (typeof raw === "number") {
    return (
      { 0: "owner", 1: "admin", 2: "editor", 3: "contributor", 4: "viewer" }[
        raw
      ] || null
    );
  }
  return null;
}

// TODO: Maybe we can merge this with exposeGlobals?
export function exposeRoleFlags(req, res, next) {
  const label = roleLabelFrom(req.user);
  const isOwner = label === "owner";
  const isAdmin = label === "admin";
  res.locals.role = label;
  res.locals.is_owner = isOwner;
  res.locals.is_admin = isAdmin;
  res.locals.can_access_admin = isOwner || isAdmin;
  next();
}
