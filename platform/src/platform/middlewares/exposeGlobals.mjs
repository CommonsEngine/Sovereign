// TODO: Utilize config/head.mjs for these

import pkg from "../../config/pkg.mjs";

const IS_PROD = (process.env.NODE_ENV || "").trim() === "production";

const manifest = pkg.manifest;

export default function exposeGlobals(req, res, next) {
  if (req.path.startsWith("/api/") || req.path.startsWith("/auth/")) {
    return next();
  }

  const appVersion = pkg.version;
  const cacheBuster = IS_PROD ? String(appVersion) : String(Date.now());

  // TODO: Expose api level globals too
  res.locals.head = {
    lang: { short: "en", long: "en-US" },
    title: manifest.title,
    meta: [
      { name: "application-name", content: manifest.title },
      { name: "description", content: manifest.description },
      { name: "keywords", content: pkg?.keywords?.join(", ") }, // TODO: Pick keywords from manifest
      { name: "robots", content: "index,follow" },
      { name: "theme-color", content: "#ffffff" },
      // Open Graph
      { property: "og:site_name", content: manifest.title },
      { property: "og:type", content: "app" },
      { property: "og:title", content: manifest.title },
      { property: "og:description", content: manifest.description },
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
  next();
}
