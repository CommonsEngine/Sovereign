import env from "$/config/env.mjs";
import logger from "$/services/logger.mjs";

const config = env();

const DEFAULT_WINDOW_MS = Number(config.RATE_LIMIT_WINDOW_MS) || 60_000;
const DEFAULT_PUBLIC_MAX = Number(config.RATE_LIMIT_PUBLIC_MAX) || 60;
const DEFAULT_AUTHED_MAX = Number(config.RATE_LIMIT_AUTHED_MAX) || 300;

const stores = new Map();

function cleanupStores() {
  const now = Date.now();
  for (const [key, entry] of stores.entries()) {
    if (entry.resetAt <= now) {
      stores.delete(key);
    }
  }
}

const cleanupInterval = setInterval(cleanupStores, DEFAULT_WINDOW_MS);
cleanupInterval.unref?.();

function normalizeHeader(value) {
  if (!value) return null;
  if (Array.isArray(value)) {
    return value[0] || null;
  }
  return String(value);
}

function getClientIp(req) {
  const xff = normalizeHeader(req.headers?.["x-forwarded-for"]);
  if (xff) {
    const first = xff.split(",")[0].trim();
    if (first) return first;
  }
  return req.ip || req.connection?.remoteAddress || req.socket?.remoteAddress || "unknown";
}

function formatMessage(scope) {
  if (scope === "authed") return "Too many requests from this account. Please slow down.";
  return "Too many requests from your IP. Please try again later.";
}

function respond429(req, res, payload) {
  if (req.accepts?.("json") || req.is?.("application/json") || req.path?.startsWith("/api/")) {
    return res.status(429).json(payload);
  }
  return res.status(429).type("text/plain").send(payload.message);
}

function createRateLimiter({ scope, max = 60, windowMs = 60_000, message, keyGenerator } = {}) {
  const scopedMessage = message || formatMessage(scope);

  return function rateLimit(req, res, next) {
    if (!max || max < 1) return next();

    let key = null;
    try {
      key =
        (typeof keyGenerator === "function" && keyGenerator(req)) ||
        (scope === "authed" && req.user?.id && `user:${req.user.id}`) ||
        `ip:${getClientIp(req)}`;
    } catch (err) {
      logger.warn?.("Rate limiter key generation failed", { err });
      key = `ip:${getClientIp(req)}`;
    }

    const now = Date.now();
    let entry = stores.get(key);
    if (!entry || entry.resetAt <= now) {
      entry = { count: 0, resetAt: now + windowMs };
    }
    entry.count += 1;
    stores.set(key, entry);

    if (entry.count > max) {
      const retryAfterSeconds = Math.max(1, Math.ceil((entry.resetAt - now) / 1000));
      res.set("Retry-After", String(retryAfterSeconds));
      const payload = {
        error: "too_many_requests",
        message: scopedMessage,
        scope: scope || "general",
        retryAfter: retryAfterSeconds,
      };
      logger.warn?.("Rate limit exceeded", {
        scope,
        key,
        max,
        windowMs,
        path: req.path,
      });
      return respond429(req, res, payload);
    }

    return next();
  };
}

export function buildRateLimiters(overrides = {}) {
  const windowMs = overrides.windowMs ?? DEFAULT_WINDOW_MS;
  const publicMax = overrides.publicMax ?? DEFAULT_PUBLIC_MAX;
  const authedMax = overrides.authedMax ?? DEFAULT_AUTHED_MAX;

  return {
    public: createRateLimiter({
      id: "public",
      scope: "public",
      max: publicMax,
      windowMs,
    }),
    authedApi: createRateLimiter({
      id: "authed-api",
      scope: "authed",
      max: authedMax,
      windowMs,
      keyGenerator: (req) => (req.user?.id ? `user:${req.user.id}` : `ip:${getClientIp(req)}`),
    }),
  };
}

const rateLimiters = buildRateLimiters();

export const { public: publicLimiter, authedApi: authedApiLimiter } = rateLimiters;

export default rateLimiters;
