import env from "../config/env.mjs";

const { APP_URL } = env();

const DEFAULTS = Object.freeze({
  lang: "en",
  title: "Sovereign — Reclaim your digital freedom",
  meta: Object.freeze([
    { name: "application-name", content: "Sovereign" },
    { name: "description", content: "Reclaim your digital freedom" },
    { name: "keywords", content: "" },
    { name: "robots", content: "index,follow" },
    { name: "theme-color", content: "#ffffff" },
    // Open Graph
    { name: "og:site_name", content: "Sovereign" },
    { name: "og:type", content: "app" },
    { name: "og:title", content: "Sovereign — Reclaim your digital freedom" },
    { name: "og:description", content: "Reclaim your digital freedom." },
    { name: "og:url", content: "/" },
    { name: "og:image", content: "/assets/og-image.png" },
    { name: "og:image:type", content: "image/png" },
    { name: "og:image:width", content: "1200" },
    { name: "og:image:height", content: "630" },
    // Twitter
    { name: "twitter:image", content: "/assets/og-image.png" },
    { name: "twitter:card", content: "summary_large_image" },
  ]),
  link: Object.freeze([{ rel: "canonical", href: "/" }]),
});

const isOg = (n) => /^og:/.test(n || "");

// Normalize a meta entry: OG -> property, Twitter keeps name
const normalizeMeta = (m) =>
  isOg(m.name)
    ? {
        property: m.name,
        content: m.content,
        ...(m.media ? { media: m.media } : {}),
      }
    : m;

// Precompute normalized defaults once
const DEFAULT_META_NORMALIZED = Object.freeze(DEFAULTS.meta.map(normalizeMeta));

const keyOfMeta = (m) =>
  m.name ? `n:${m.name}` : m.property ? `p:${m.property}` : "";
const keyOfLink = (l) => `${l.rel}:${l.href}`;

// Merge with last-wins semantics
function mergeLastWins(defaults, overrides, keyFn) {
  const map = new Map();
  for (const item of defaults || []) {
    const k = keyFn(item);
    if (k) map.set(k, item);
  }
  for (const item of overrides || []) {
    const k = keyFn(item);
    if (k) map.set(k, item); // override
  }
  return Array.from(map.values());
}

function toAbsolute(baseUrl, path) {
  const base = String(baseUrl || "").replace(/\/+$/, "");
  const p = String(path || "/").startsWith("/") ? path : `/${path || ""}`;
  return `${base}${p}`;
}

export const headConfig = {
  // opts: { baseUrl, path, title, description, image, themeColorLight, extraMeta:[], extraLink:[] }
  get: (opts = {}) => {
    const {
      baseUrl = APP_URL,
      // Prefer req.path (no query params) for canonical
      path = "/",
      title,
      description,
      image,
      themeColorLight,
      extraMeta = [],
      extraLink = [],
    } = opts;

    const absCanonical = baseUrl ? toAbsolute(baseUrl, path) : "/";
    const absImage =
      image ||
      DEFAULTS.meta.find((m) => m.name === "og:image")?.content ||
      "/assets/og-image.png";

    // Build override meta and normalize OG only for overrides once
    const overrideMeta = [
      ...(title ? [{ name: "og:title", content: title }] : []),
      ...(description
        ? [{ name: "og:description", content: description }]
        : []),
      ...(baseUrl ? [{ name: "og:url", content: absCanonical }] : []),
      ...(absImage ? [{ name: "twitter:image", content: absImage }] : []),
      ...(themeColorLight
        ? [{ name: "theme-color", content: themeColorLight }]
        : []),
      ...extraMeta,
    ].map(normalizeMeta);

    const metaFinal = mergeLastWins(
      DEFAULT_META_NORMALIZED,
      overrideMeta,
      keyOfMeta,
    );

    const defaultLinks = DEFAULTS.link.map((l) =>
      l.rel === "canonical" && baseUrl ? { ...l, href: absCanonical } : l,
    );
    const linkFinal = mergeLastWins(defaultLinks, extraLink, keyOfLink);

    return Object.freeze({
      lang: DEFAULTS.lang,
      title: title || DEFAULTS.title,
      meta: metaFinal,
      link: linkFinal,
    });
  },
};

export const useHeadConfig = (payload, req, overrides = {}) => {
  const head = headConfig.get({
    path: req.path, // avoids query noise in canonical
    ...overrides,
  });
  return { ...payload, head };
};
