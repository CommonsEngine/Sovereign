import logger from "$/services/logger.js";

const CACHE_HIT_MS = 3_000;
const CACHE_MISS_MS = 1_500;
const REQUEST_TIMEOUT_MS = 600;
const cache = new Map();

function normalizeOrigin(origin) {
  if (!origin) return null;
  return String(origin).replace(/\/+$/, "");
}

export async function resolveSpaDevServer(plugin, namespace) {
  if ((process.env.NODE_ENV || "development") === "production") {
    return null;
  }
  const config = plugin?.sovereign?.devServer?.web;
  if (!config?.origin || !config?.entry) {
    return null;
  }

  const origin = normalizeOrigin(config.origin);
  if (!origin) return null;

  const key = namespace || plugin?.namespace || plugin?.id || origin;
  const now = Date.now();

  const cached = cache.get(key);
  if (cached && cached.expiresAt > now) {
    return cached.value;
  }

  const clientPath = config.client || "/@vite/client";
  const pingPath = config.ping || clientPath;
  const pingUrl = new URL(pingPath, origin).toString();
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);

  try {
    const res = await fetch(pingUrl, { method: "GET", signal: controller.signal });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);

    const info = {
      origin,
      entry: config.entry,
      client: clientPath,
    };
    cache.set(key, { expiresAt: now + CACHE_HIT_MS, value: info });
    if (!cached || !cached.value) {
      logger.info(`[plugins] ${key}: using SPA dev server at ${origin}`);
    }
    return info;
  } catch (err) {
    cache.set(key, { expiresAt: now + CACHE_MISS_MS, value: null });
    if (cached?.value) {
      logger.warn(`[plugins] ${key}: SPA dev server became unavailable`, err);
    }
    return null;
  } finally {
    clearTimeout(timeout);
  }
}
