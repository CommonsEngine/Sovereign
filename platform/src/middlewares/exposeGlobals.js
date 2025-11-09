import path from "node:path";

import * as fs from "$/utils/fs.js";

// TODO: Utilize config/head.js for these

const manifest = fs.readJson(path.resolve(process.env.ROOT_DIR, "manifest.json"));

const IS_PROD = (process.env.NODE_ENV || "").trim() === "production";

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
  };

  const manifestModules = Array.isArray(manifest.modules) ? manifest.modules : [];
  const pathname = req.path || "/";
  const activeModule =
    manifestModules.find((mod) => {
      const slug = typeof mod?.value === "string" ? mod.value.trim() : "";
      if (!slug) return false;
      const base = `/${slug}`;
      return pathname === base || pathname.startsWith(`${base}/`);
    }) || null;

  res.locals.modules = manifestModules.map((mod) => ({
    ...mod,
    isActive: activeModule ? activeModule.value === mod.value : false,
  }));

  if (typeof res.locals.showHeader === "undefined") {
    res.locals.showHeader = activeModule ? activeModule?.ui?.layout?.header !== false : true;
  }

  if (typeof res.locals.showSidebar === "undefined") {
    res.locals.showSidebar = activeModule ? activeModule?.ui?.layout?.sidebar !== false : true;
  }

  next();
}
