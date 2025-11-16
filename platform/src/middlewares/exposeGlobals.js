import path from "node:path";

import * as fs from "$/utils/fs.js";

// TODO: Utilize config/head.js for these

const manifest = fs.readJson(path.resolve(process.env.ROOT_DIR, "manifest.json"));

const IS_PROD = (process.env.NODE_ENV || "").trim() === "production";

const normalizeRoleKey = (value) => {
  if (!value) return null;
  if (typeof value === "string") return value.trim().toLowerCase();
  if (typeof value === "number") return String(value);
  if (typeof value === "object") {
    if (typeof value.key === "string" && value.key.trim()) return value.key.trim().toLowerCase();
    if (typeof value.id === "string" && value.id.trim()) return value.id.trim().toLowerCase();
    if (typeof value.id === "number") return String(value.id);
    if (typeof value.label === "string" && value.label.trim())
      return value.label.trim().toLowerCase();
  }
  return null;
};

const collectUserRoles = (user) => {
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
  if (user.primaryRole) {
    const key = normalizeRoleKey(user.primaryRole);
    if (key) roles.add(key);
  }
  return roles;
};

const moduleAccessible = (module, userRoles) => {
  const required = Array.isArray(module?.access?.roles) ? module.access.roles : [];
  if (!required.length) return true;
  if (!userRoles || userRoles.size === 0) return false;
  return required.some((role) => userRoles.has(role));
};

export default function exposeGlobals(req, res, next) {
  if (req.path.startsWith("/api/") || req.path.startsWith("/auth/")) {
    return next();
  }

  // TODO: Fetch from config/env
  const appVersion = manifest.platform.version;
  const cacheBuster = IS_PROD ? String(appVersion) : String(Date.now());

  // TODO: Expose api level globals too
  res.locals.head = {
    lang: { short: "en", long: "en-US" },
    title: manifest.platform.title,
    meta: [
      { name: "application-name", content: manifest.platform.title },
      { name: "description", content: manifest.platform.description },
      { name: "keywords", content: manifest.platform.keywords?.join(", ") }, // TODO: Pick keywords from manifest
      { name: "robots", content: "index,follow" },
      { name: "theme-color", content: "#ffffff" },
      // Open Graph
      { property: "og:site_name", content: manifest.platform.title },
      { property: "og:type", content: "app" },
      { property: "og:title", content: manifest.platform.title },
      { property: "og:description", content: manifest.platform.description },
      { property: "og:url", content: "/" },
      { property: "og:image", content: "/assets/og-image.png" },
      { property: "og:image:type", content: "image/png" },
      { property: "og:image:width", content: "1200" },
      { property: "og:image:height", content: "630" },
      // Twitter
      { name: "twitter:image", content: "/assets/og-image.png" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
    link: [{ rel: "canonical", href: "/" }],
    cacheBuster,
  };

  // Set app-wide globals
  res.locals.app = {
    version: String(appVersion),
    cacheBuster,
  };

  res.locals.user = {
    name: req.user?.name || "guest",
    primaryRole: req.user?.role || null,
    roles: Array.isArray(req.user?.roles) ? req.user.roles : [],
  };

  const manifestModules = Array.isArray(manifest.modules) ? manifest.modules : [];
  const pathname = req.path || "/";
  const roleSet = collectUserRoles(req.user);
  const availableModules = manifestModules.filter((mod) => moduleAccessible(mod, roleSet));
  const activeModule =
    availableModules.find((mod) => {
      const slug = typeof mod?.value === "string" ? mod.value.trim() : "";
      if (!slug) return false;
      const base = `/${slug}`;
      return pathname === base || pathname.startsWith(`${base}/`);
    }) || null;

  res.locals.modules = availableModules.map((mod) => ({
    ...mod,
    isActive: activeModule ? activeModule.value === mod.value : false,
  }));

  let activePage;
  const originalUrl = req.originalUrl;
  if (originalUrl === "/") activePage = "projects";
  const targetPath = originalUrl.split("/")[1];
  if (targetPath) {
    activePage = targetPath;
  }

  res.locals.activePage = activePage;

  if (typeof res.locals.showHeader === "undefined") {
    res.locals.showHeader = activeModule ? activeModule?.ui?.layout?.header !== false : true;
  }

  if (typeof res.locals.showSidebar === "undefined") {
    res.locals.showSidebar = activeModule ? activeModule?.ui?.layout?.sidebar !== false : true;
  }

  next();
}
