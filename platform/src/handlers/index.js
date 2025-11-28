import env from "$/config/env.js";

const { GUEST_LOGIN_ENABLED, GUEST_LOGIN_ENABLED_BYPASS_LOGIN, PROJECTS } = env();

const normalizeRoleKey = (value) => {
  if (!value) return null;
  if (typeof value === "string") return value.trim().toLowerCase();
  if (typeof value === "object") {
    if (typeof value.key === "string" && value.key.trim()) return value.key.trim().toLowerCase();
    if (typeof value.id === "string" && value.id.trim()) return value.id.trim().toLowerCase();
    if (typeof value.label === "string" && value.label.trim())
      return value.label.trim().toLowerCase();
  }
  return null;
};

const collectRoleKeys = (user) => {
  const roles = new Set();
  if (!user) return roles;
  if (Array.isArray(user.roles)) {
    user.roles.forEach((role) => {
      const key = normalizeRoleKey(role);
      if (key) roles.add(key);
    });
  }
  if (user.role) {
    const key = normalizeRoleKey(user.role);
    if (key) roles.add(key);
  }
  return roles;
};

const pluginAllowed = (entry, pluginAccess) => {
  if (!entry || !entry.value) return true;
  const namespace = entry.value;
  const enabled = Array.isArray(pluginAccess?.enabled) ? new Set(pluginAccess.enabled) : new Set();
  const disabled = Array.isArray(pluginAccess?.disabled)
    ? new Set(pluginAccess.disabled)
    : new Set();
  const pluginList = Array.isArray(pluginAccess?.plugins) ? pluginAccess.plugins : [];
  const hasAccessData = enabled.size > 0 || disabled.size > 0 || pluginList.length > 0;

  if (disabled.has(namespace)) return false;
  if (!hasAccessData) return true;
  const pluginEntry = pluginList.find((item) => item?.namespace === namespace);
  if (pluginEntry) return !!pluginEntry.enabled;
  return enabled.has(namespace);
};

export async function viewIndex(req, res) {
  try {
    const showUserMenu = !(GUEST_LOGIN_ENABLED && GUEST_LOGIN_ENABLED_BYPASS_LOGIN);
    const roleSet = collectRoleKeys(req.user);
    const pluginAccess = req.user?.pluginAccess;

    const projects = Array.isArray(PROJECTS)
      ? PROJECTS.filter((project) => {
          const requiredRoles = Array.isArray(project?.access?.roles) ? project.access.roles : [];
          const roleOk =
            requiredRoles.length === 0 ||
            requiredRoles.some((role) => roleSet.has(normalizeRoleKey(role)));
          const pluginOk = pluginAllowed(project, pluginAccess);
          return roleOk && pluginOk;
        })
      : [];

    return res.render("index", {
      show_user_menu: showUserMenu,
      projects,
    });
  } catch (err) {
    return res.status(500).render("error", {
      code: 500,
      message: "Oops!",
      description: "Failed to load projects",
      error: err?.stack || err?.message || String(err),
      nodeEnv: process.env.NODE_ENV,
    });
  }
}
