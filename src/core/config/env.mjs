import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import prisma from "$/core/services/database.mjs";

import { toBool } from "./utils.mjs";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const resolveRoot = () => {
  if (process.env.APP_ROOT) {
    return path.resolve(process.env.APP_ROOT);
  }
  const cwd = process.cwd();
  if (cwd && path.isAbsolute(cwd)) {
    return cwd;
  }
  return path.resolve(__dirname, "../..");
};

const __rootdir = resolveRoot();
const __srcDir = path.join(__rootdir, "src");
const __coreDir = path.join(__srcDir, "core");

const resolveFirstExisting = (candidates, fallback) => {
  for (const candidate of candidates) {
    try {
      if (fs.existsSync(candidate)) return candidate;
    } catch {
      // ignore
    }
  }
  return fallback;
};

const preferDist =
  (process.env.NODE_ENV || "development") === "production" ||
  process.env.PREFER_DIST_BUILD === "true";

const publicCandidates = preferDist
  ? [
      path.join(__rootdir, "dist", "core", "public"),
      path.join(__rootdir, "public"),
    ]
  : [path.join(__coreDir, "public"), path.join(__rootdir, "dist", "public")];

const __publicdir = resolveFirstExisting(
  publicCandidates,
  path.join(__coreDir, "public"),
);

const templateCandidates = preferDist
  ? [
      path.join(__rootdir, "dist", "views"),
      path.join(__rootdir, "src", "core", "views"),
    ]
  : [
      path.join(__rootdir, "src", "core", "views"),
      path.join(__rootdir, "dist", "views"),
    ];

const __templatedir = resolveFirstExisting(
  templateCandidates,
  path.join(__rootdir, "src", "core", "views"),
);

const __datadir = path.resolve(
  process.env.__datadir || path.join(__rootdir, "data"),
);

const splitCsv = (input) =>
  String(input || "")
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean);

const baseLocales =
  process.env.SUPPORTED_LOCALES && process.env.SUPPORTED_LOCALES.trim()
    ? splitCsv(process.env.SUPPORTED_LOCALES)
    : ["en-US"];

const defaultDbPath = path.join(__datadir, "sovereign.db");

const baseTemplate = Object.freeze({
  APP_NAME: process.env.APP_NAME || "Sovereign",
  APP_TAGLINE: process.env.APP_TAGLINE || "",
  APP_DESCRIPTION: process.env.APP_DESCRIPTION || "",
  APP_VERSION: process.env.APP_VERSION || "0.1.0",
  APP_URL: process.env.APP_URL || "http://localhost:3000",

  AUTH_ARGON2_ITERATIONS: Number(process.env.AUTH_ARGON2_ITERATIONS ?? 2),
  AUTH_ARGON2_MEMORY: Number(process.env.AUTH_ARGON2_MEMORY ?? 19456),
  AUTH_ARGON2_PARALLELISM: Number(process.env.AUTH_ARGON2_PARALLELISM ?? 1),
  AUTH_PASSWORD_MIN_LENGTH: Number(process.env.AUTH_PASSWORD_MIN_LENGTH ?? 8),
  AUTH_SESSION_COOKIE_NAME:
    process.env.AUTH_SESSION_COOKIE_NAME || "svg_session",
  AUTH_SESSION_TTL_HOURS: Number(process.env.AUTH_SESSION_TTL_HOURS ?? 720),

  DATABASE_URL: process.env.DATABASE_URL || `file:${defaultDbPath}`,

  DEFAULT_USER_ROLE: process.env.DEFAULT_USER_ROLE || "guest",
  SIGNUP_POLICY: process.env.SIGNUP_POLICY || "invite", // 'open' or 'invite'

  FEATURE_TERMS_REQUIRE_ACCEPTANCE: toBool(
    process.env.FEATURE_TERMS_REQUIRE_ACCEPTANCE,
    false,
  ),

  SMTP_URL: process.env.SMTP_URL || "",
  SMTP_HOST: process.env.SMTP_HOST || "",
  SMTP_PORT: Number(process.env.SMTP_PORT ?? 587),
  SMTP_SECURE: toBool(process.env.SMTP_SECURE, false),
  SMTP_USER: process.env.SMTP_USER || "",
  SMTP_PASSWORD: process.env.SMTP_PASSWORD || "",
  SMTP_IGNORE_TLS: toBool(process.env.SMTP_IGNORE_TLS, false),
  EMAIL_FROM_ADDRESS:
    process.env.EMAIL_FROM_ADDRESS ||
    process.env.EMAIL_FROM ||
    "no-reply@localhost",
  EMAIL_FROM_NAME:
    process.env.EMAIL_FROM_NAME || process.env.APP_NAME || "Sovereign",
  EMAIL_REPLY_TO: process.env.EMAIL_REPLY_TO || "",
  EMAIL_DELIVERY_BYPASS: toBool(process.env.EMAIL_DELIVERY_BYPASS, true),

  FT_PROJECT_TYPE_BLOG: toBool(process.env.FT_PROJECT_TYPE_BLOG, true),
  FT_PROJECT_TYPE_PAPERTRAIL: toBool(
    process.env.FT_PROJECT_TYPE_PAPERTRAIL,
    false,
  ),
  FT_PROJECT_TYPE_WORKSPACE: toBool(
    process.env.FT_PROJECT_TYPE_WORKSPACE,
    false,
  ),

  GUEST_LOGIN_ENABLED: toBool(process.env.GUEST_LOGIN_ENABLED, false),
  GUEST_LOGIN_ENABLED_BYPASS_LOGIN: toBool(
    process.env.GUEST_LOGIN_ENABLED_BYPASS_LOGIN,
    false,
  ),

  LOCALE_DEFAULT: process.env.DEFAULT_LOCALE || "en-US",
  LOCALES_SUPPORTED: baseLocales,
  TIMEZONE_DEFAULT: process.env.DEFAULT_TIMEZONE || "UTC",
  CURRENCY_DEFAULT: process.env.DEFAULT_CURRENCY || "USD",

  NODE_ENV: process.env.NODE_ENV || "development",
  PORT: Number(process.env.PORT) || 3000,

  IS_PROD: (process.env.NODE_ENV || "development") === "production",

  __rootdir,
  __publicdir,
  __templatedir,
  __datadir,
});

const VERSION_KEY = "appsettings";
const VERSION_CHECK_INTERVAL_MS = 5_000;

const PLATFORM_SCOPE = "platform";

let cachedVersion = null;
let lastVersionCheckAt = 0;
let refreshPromise = null;
let settingsLoaded = false;

let appSettingsByScope = new Map();

const configCache = new Map();

const cloneBaseTemplate = () => ({
  ...baseTemplate,
  LOCALES_SUPPORTED: Array.isArray(baseTemplate.LOCALES_SUPPORTED)
    ? [...baseTemplate.LOCALES_SUPPORTED]
    : [],
  APP_SETTINGS: {},
});

const toStringValue = (value) => {
  if (value === null || value === undefined) return null;
  const str = String(value).trim();
  return str || null;
};

const toPositiveInt = (value) => {
  const num = Number(value);
  if (!Number.isFinite(num)) return null;
  const rounded = Math.max(0, Math.trunc(num));
  return Number.isFinite(rounded) ? rounded : null;
};

const toStringArray = (value) => {
  if (Array.isArray(value)) {
    return value.map((item) => String(item || "").trim()).filter(Boolean);
  }
  if (typeof value === "string") {
    return splitCsv(value);
  }
  return null;
};

const SETTING_OVERRIDES = {
  "env.app.name": (config, value) => {
    const str = toStringValue(value);
    if (str) config.APP_NAME = str;
  },
  "env.app.tagline": (config, value) => {
    const str = toStringValue(value);
    if (str !== null) config.APP_TAGLINE = str;
  },
  "env.app.description": (config, value) => {
    const str = toStringValue(value);
    if (str !== null) config.APP_DESCRIPTION = str;
  },
  "env.app.version": (config, value) => {
    const str = toStringValue(value);
    if (str) config.APP_VERSION = str;
  },
  "env.app.url": (config, value) => {
    const str = toStringValue(value);
    if (str) config.APP_URL = str;
  },
  "env.locale.default": (config, value) => {
    const str = toStringValue(value);
    if (str) config.LOCALE_DEFAULT = str;
  },
  "env.locale.supported": (config, value) => {
    const arr = toStringArray(value);
    if (arr && arr.length > 0) config.LOCALES_SUPPORTED = arr;
  },
  "env.timezone.default": (config, value) => {
    const str = toStringValue(value);
    if (str) config.TIMEZONE_DEFAULT = str;
  },
  "env.currency.default": (config, value) => {
    const str = toStringValue(value);
    if (str) config.CURRENCY_DEFAULT = str;
  },
  "auth.session.ttl_ms": (config, value) => {
    const num = toPositiveInt(value);
    if (num && num > 0) {
      config.SESSION_TTL_MS = num;
      config.AUTH_SESSION_TTL_HOURS = Math.max(
        1,
        Math.round(num / (1000 * 60 * 60)),
      );
    }
  },
  "auth.cookie.name": (config, value) => {
    const str = toStringValue(value);
    if (str) config.AUTH_SESSION_COOKIE_NAME = str;
  },
  "auth.password.min_length": (config, value) => {
    const num = toPositiveInt(value);
    if (num && num > 0) config.AUTH_PASSWORD_MIN_LENGTH = num;
  },
  "email.from.name": (config, value) => {
    const str = toStringValue(value);
    config.EMAIL_FROM_NAME = str ?? "";
  },
  "email.from.address": (config, value) => {
    const str = toStringValue(value);
    config.EMAIL_FROM_ADDRESS = str ?? "";
  },
  "email.reply_to": (config, value) => {
    const str = toStringValue(value);
    config.EMAIL_REPLY_TO = str ?? "";
  },
  "feature.guest.login.enabled": (config, value) => {
    config.GUEST_LOGIN_ENABLED = toBool(
      value,
      config.GUEST_LOGIN_ENABLED ?? false,
    );
  },
  "feature.guest.login.enabled.bypass": (config, value) => {
    config.GUEST_LOGIN_ENABLED_BYPASS_LOGIN = toBool(
      value,
      config.GUEST_LOGIN_ENABLED_BYPASS_LOGIN ?? false,
    );
  },
  "feature.email.delivery.bypass": (config, value) => {
    config.EMAIL_DELIVERY_BYPASS = toBool(
      value,
      config.EMAIL_DELIVERY_BYPASS ?? true,
    );
  },
  "email.smtp.url": (config, value) => {
    const str = toStringValue(value);
    config.SMTP_URL = str ?? "";
  },
  "email.smtp.host": (config, value) => {
    const str = toStringValue(value);
    config.SMTP_HOST = str ?? "";
  },
  "email.smtp.port": (config, value) => {
    if (value === null || value === undefined || value === "") return;
    const num = toPositiveInt(value);
    if (num && num > 0) config.SMTP_PORT = num;
  },
  "email.smtp.secure": (config, value) => {
    config.SMTP_SECURE = toBool(value, config.SMTP_SECURE ?? false);
  },
  "email.smtp.ignore_tls": (config, value) => {
    config.SMTP_IGNORE_TLS = toBool(value, config.SMTP_IGNORE_TLS ?? false);
  },
  "email.smtp.user": (config, value) => {
    const str = toStringValue(value);
    config.SMTP_USER = str ?? "";
  },
  "email.smtp.password": (config, value) => {
    if (value === null || value === undefined) {
      config.SMTP_PASSWORD = "";
    } else {
      config.SMTP_PASSWORD = String(value);
    }
  },
  "feature.terms.require_acceptance": (config, value) => {
    config.FEATURE_TERMS_REQUIRE_ACCEPTANCE = toBool(
      value,
      config.FEATURE_TERMS_REQUIRE_ACCEPTANCE ?? false,
    );
  },
  "signup.policy": (config, value) => {
    const str = toStringValue(value);
    if (str) config.SIGNUP_POLICY = str;
  },
  "default.user.role": (config, value) => {
    const str = toStringValue(value);
    if (str) config.DEFAULT_USER_ROLE = str;
  },
};

const applyAppSettings = (config, settings) => {
  if (!settings) return;
  for (const [key, value] of Object.entries(settings)) {
    config.APP_SETTINGS[key] = value;
    const handler = SETTING_OVERRIDES[key];
    if (handler) {
      try {
        handler(config, value);
      } catch {
        // ignore handler errors, fall back to raw APP_SETTINGS value
      }
    }
  }
};

const finalizeConfig = (config) => {
  const result = { ...config };

  const sessionTtlMsCandidate =
    typeof result.SESSION_TTL_MS === "number" &&
    Number.isFinite(result.SESSION_TTL_MS)
      ? result.SESSION_TTL_MS
      : null;

  const fallbackTtlMs =
    1000 * 60 * 60 * Number(result.AUTH_SESSION_TTL_HOURS ?? 720);

  const sessionTtlMs =
    sessionTtlMsCandidate && sessionTtlMsCandidate > 0
      ? sessionTtlMsCandidate
      : fallbackTtlMs;

  result.SESSION_TTL_MS = sessionTtlMs;
  result.AUTH_SESSION_TTL_HOURS = Math.max(
    1,
    Math.round(sessionTtlMs / (1000 * 60 * 60)),
  );

  result.COOKIE_OPTS = Object.freeze({
    httpOnly: true,
    secure: result.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: result.SESSION_TTL_MS,
  });

  result.IS_PROD = result.NODE_ENV === "production";

  result.LOCALES_SUPPORTED = Object.freeze(
    Array.isArray(result.LOCALES_SUPPORTED)
      ? result.LOCALES_SUPPORTED.map((locale) => String(locale))
      : [],
  );

  result.APP_SETTINGS = Object.freeze({ ...config.APP_SETTINGS });

  return Object.freeze(result);
};

const computeScopes = ({ orgId, workspaceId, userId } = {}) => {
  const scopes = [PLATFORM_SCOPE];
  if (typeof orgId === "string" && orgId.trim()) {
    scopes.push(`org:${orgId.trim()}`);
  }
  if (typeof workspaceId === "string" && workspaceId.trim()) {
    scopes.push(`workspace:${workspaceId.trim()}`);
  }
  if (typeof userId === "string" && userId.trim()) {
    scopes.push(`user:${userId.trim()}`);
  }
  return [...new Set(scopes)];
};

const buildConfigForScopes = (scopes) => {
  const cacheKey = `${cachedVersion ?? 0}:${scopes.join("|")}`;
  const cached = configCache.get(cacheKey);
  if (cached) return cached;

  const config = cloneBaseTemplate();
  const mergedSettings = {};

  for (const scope of scopes) {
    const scopeSettings = appSettingsByScope.get(scope);
    if (!scopeSettings) continue;
    Object.assign(mergedSettings, scopeSettings);
  }

  applyAppSettings(config, mergedSettings);
  const finalized = finalizeConfig(config);
  configCache.set(cacheKey, finalized);
  return finalized;
};

const mapRowsByScope = (rows) => {
  const grouped = new Map();
  for (const row of rows) {
    const scopeKey = row.scope || PLATFORM_SCOPE;
    if (!grouped.has(scopeKey)) grouped.set(scopeKey, {});
    grouped.get(scopeKey)[row.key] = row.value;
  }
  return grouped;
};

const refreshSettings = async (force = false) => {
  const now = Date.now();
  if (
    !force &&
    settingsLoaded &&
    now - lastVersionCheckAt < VERSION_CHECK_INTERVAL_MS
  ) {
    return;
  }

  lastVersionCheckAt = now;
  const versionRow = await prisma.versionRegistry.findUnique({
    where: { id: VERSION_KEY },
    select: { v: true },
  });
  const latestVersion = versionRow?.v ?? 0;

  if (force || !settingsLoaded || latestVersion !== cachedVersion) {
    const rows = await prisma.appSetting.findMany({
      select: { scope: true, key: true, value: true },
    });
    appSettingsByScope = mapRowsByScope(rows);
    cachedVersion = latestVersion;
    settingsLoaded = true;
    configCache.clear();
  }
};

const scheduleRefresh = (force = false) => {
  if (force) {
    if (refreshPromise) {
      refreshPromise = refreshPromise
        .catch(() => {})
        .then(() => refreshSettings(true))
        .finally(() => {
          refreshPromise = null;
        });
    } else {
      refreshPromise = refreshSettings(true).finally(() => {
        refreshPromise = null;
      });
    }
    return;
  }

  if (
    refreshPromise ||
    (!force &&
      settingsLoaded &&
      Date.now() - lastVersionCheckAt < VERSION_CHECK_INTERVAL_MS)
  ) {
    return;
  }

  refreshPromise = refreshSettings(false)
    .catch(() => {})
    .finally(() => {
      refreshPromise = null;
    });
};

await refreshSettings(true);

export default function env(context = {}) {
  const scopes = computeScopes(context);
  scheduleRefresh(false);
  return buildConfigForScopes(scopes);
}

export async function refreshEnvCache({ force = false } = {}) {
  await refreshSettings(force);
}
