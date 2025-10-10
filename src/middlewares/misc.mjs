// TODO: Fetch from manifest.json
// TODO: Utilize config/head.mjs
const namespace = "Sovereign";
const title = "Sovereign — Reclaim your digital freedom.";
const description =
  "A self-hostable, privacy-first workspace suite — the foundation of personal cloud autonomy.";

export function exposeGlobals(req, res, next) {
  res.locals.head = {
    lang: { short: "en", long: "en-US" },
    title,
    meta: [
      { name: "application-name", content: namespace },
      { name: "description", content: description },
      { name: "keywords", content: "" },
      { name: "robots", content: "index,follow" },
      { name: "theme-color", content: "#ffffff" },
      // Open Graph
      { property: "og:site_name", content: namespace },
      { property: "og:type", content: "app" },
      { property: "og:title", content: title },
      { property: "og:description", content: description },
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
