import { createRequire } from "module";

const require = createRequire(import.meta.url);
const pkg = require("../../package.json");

export function exposeGlobals(req, res, next) {
  res.locals.head = {
    lang: { short: "en", long: "en-US" },
    title: pkg.manifest.title,
    meta: [
      { name: "application-name", content: pkg.manifest.title },
      { name: "description", content: pkg.manifest.description },
      { name: "keywords", content: pkg.keywords.join(", ") },
      { name: "robots", content: "index,follow" },
      { name: "theme-color", content: "#ffffff" },
      // Open Graph
      { property: "og:site_name", content: pkg.manifest.title },
      { property: "og:type", content: "app" },
      { property: "og:title", content: pkg.manifest.title },
      { property: "og:description", content: pkg.manifest.description },
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
  next();
}
