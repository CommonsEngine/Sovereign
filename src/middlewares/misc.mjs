import { createRequire } from "module";

// TODO: Utilize confg/head.mjs for these

const require = createRequire(import.meta.url);
const pkg = require("../../package.json");

export function exposeGlobals(req, res, next) {
  // TODO: Expose api level globals too
  res.locals.head = {
    lang: { short: "en", long: "en-US" },
    title: pkg.title,
    meta: [
      { name: "application-name", content: pkg.title },
      { name: "description", content: pkg.description },
      { name: "keywords", content: pkg.keywords.join(", ") },
      { name: "robots", content: "index,follow" },
      { name: "theme-color", content: "#ffffff" },
      // Open Graph
      { property: "og:site_name", content: pkg.title },
      { property: "og:type", content: "app" },
      { property: "og:title", content: pkg.title },
      { property: "og:description", content: pkg.description },
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
  };

  // Set app-wide globals
  res.locals.app = {
    version: String(pkg.version || "0.0.0"),
  };
  res.locals.user = {
    name: req.user?.name || "Guest",
  };
  next();
}
