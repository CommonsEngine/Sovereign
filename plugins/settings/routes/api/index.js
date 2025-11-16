import express from "express";

import { updatePluginRuntimeState } from "$/ext-host/plugin-state.js";

const DEFAULT_SCOPE = "platform";
const KEY_MAX_LENGTH = 200;

const TRUE_VALUES = new Set(["true", "1", "yes", "on"]);
const FALSE_VALUES = new Set(["false", "0", "no", "off"]);
const LOCALE_REGEX = /^[a-z]{2,3}(?:[-_][a-z0-9]+)*$/i;
const ALLOWED_DATE_FORMATS = new Set(["locale", "iso", "ymd", "mdy"]);
const ALLOWED_SIGNUP_POLICIES = new Set(["invite", "open"]);
const BOOLEAN_KEYS = new Set([
  "feature.guest.login.enabled",
  "feature.guest.login.enabled.bypass",
  "feature.terms.require_acceptance",
  "feature.email.delivery.bypass",
  "email.smtp.secure",
  "email.smtp.ignore_tls",
]);

const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const PLUGIN_SELECT = {
  pluginId: true,
  namespace: true,
  name: true,
  description: true,
  version: true,
  type: true,
  devOnly: true,
  enabled: true,
  corePlugin: true,
  enabledAt: true,
  disabledAt: true,
  updatedAt: true,
};

function parseBooleanLike(value) {
  if (value === null || value === undefined) return null;
  if (typeof value === "boolean") return value;
  if (typeof value === "number") return value !== 0;
  if (typeof value === "string") {
    const normalized = value.trim().toLowerCase();
    if (TRUE_VALUES.has(normalized)) return true;
    if (FALSE_VALUES.has(normalized)) return false;
  }
  return null;
}

function normalizeString(value, { allowEmpty = true } = {}) {
  if (value === null || value === undefined) return allowEmpty ? null : "";
  const str = String(value).trim();
  if (!str && !allowEmpty) {
    throw new Error("Value cannot be empty");
  }
  return str || (allowEmpty ? null : str);
}

function normalizeRequiredString(value, fieldLabel) {
  if (value === null || value === undefined) {
    throw new Error(`${fieldLabel} is required`);
  }
  const str = String(value).trim();
  if (!str) {
    throw new Error(`${fieldLabel} is required`);
  }
  return str;
}

function normalizeHttpUrl(value) {
  if (value === null || value === undefined || value === "") return null;
  const str = String(value).trim();
  try {
    const url = new URL(str);
    if (url.protocol !== "http:" && url.protocol !== "https:") {
      throw new Error("Only http(s) URLs are supported");
    }
    return url.toString();
  } catch {
    throw new Error("Value must be a valid http(s) URL");
  }
}

function normalizeInteger(value, { min, field }) {
  const num = Number(value);
  if (!Number.isFinite(num) || !Number.isInteger(num)) {
    throw new Error(`${field} must be an integer`);
  }
  if (typeof min === "number" && num < min) {
    throw new Error(`${field} must be at least ${min}`);
  }
  return num;
}

function normalizeBoolean(value, field) {
  if (value === null || value === undefined) return false;
  const parsed = parseBooleanLike(value);
  if (parsed === null) {
    throw new Error(`${field} must be a boolean`);
  }
  return parsed;
}

function normalizeLocale(value, field) {
  const raw = normalizeString(value, { allowEmpty: false });
  const normalized = raw.replace(/_/g, "-");
  if (!LOCALE_REGEX.test(normalized)) {
    throw new Error(`${field} must be a valid locale code (e.g., en-US)`);
  }
  const segments = normalized.split("-");
  const base = segments.shift().toLowerCase();
  const formatted = segments.map((segment) => {
    if (!segment) return segment;
    if (segment.length <= 2) return segment.toUpperCase();
    return segment[0].toUpperCase() + segment.slice(1);
  });
  return [base, ...formatted].filter(Boolean).join("-");
}

function normalizeLocaleList(value) {
  if (Array.isArray(value)) {
    const locales = value.map((v) => normalizeLocale(v, "Supported locale")).filter(Boolean);
    if (locales.length === 0) {
      throw new Error("Supported locales cannot be empty");
    }
    return locales;
  }

  if (value === null || value === undefined) {
    throw new Error("Supported locales cannot be empty");
  }
  const str = String(value).trim();
  if (!str) {
    throw new Error("Supported locales cannot be empty");
  }
  const locales = str
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean)
    .map((locale) => normalizeLocale(locale, "Supported locale"));

  if (locales.length === 0) {
    throw new Error("Supported locales cannot be empty");
  }

  return locales;
}

function normalizeCurrency(value) {
  const str = normalizeString(value, { allowEmpty: false });
  if (str.length !== 3) {
    throw new Error("Default currency must be a 3-letter ISO code");
  }
  return str.toUpperCase();
}

function normalizeOptionalString(value) {
  if (value === null || value === undefined) return null;
  const str = String(value).trim();
  return str || null;
}

function normalizeEmailAddress(value, field, { required = false } = {}) {
  if (value === null || value === undefined) {
    if (required) throw new Error(`${field} is required`);
    return null;
  }

  const str = String(value).trim();
  if (!str) {
    if (required) throw new Error(`${field} is required`);
    return null;
  }

  if (!EMAIL_REGEX.test(str)) {
    throw new Error(`${field} must be a valid email address`);
  }

  return str;
}

function normalizeSmtpUrl(value) {
  if (value === null || value === undefined || value === "") return null;
  const str = String(value).trim();
  try {
    const url = new URL(str);
    if (!["smtp:", "smtps:"].includes(url.protocol)) {
      throw new Error("SMTP URL must start with smtp:// or smtps://");
    }
    return url.toString();
  } catch {
    throw new Error("SMTP URL must be a valid smtp(s) URL");
  }
}

function normalizeSettingValue(key, rawValue) {
  const value = rawValue ?? null;

  switch (key) {
    case "env.app.name":
      return normalizeRequiredString(value, "App name");
    case "env.app.tagline":
    case "env.app.description":
    case "env.app.version":
      return normalizeString(value);
    case "env.app.url":
      return normalizeHttpUrl(value);
    case "default.user.role":
      return normalizeString(value);
    case "signup.policy": {
      const normalized = normalizeRequiredString(value, "Signup policy");
      if (!ALLOWED_SIGNUP_POLICIES.has(normalized)) {
        throw new Error(
          "Signup policy must be one of: " + Array.from(ALLOWED_SIGNUP_POLICIES).join(", ")
        );
      }
      return normalized;
    }
    case "auth.password.min_length":
      return normalizeInteger(value, {
        min: 4,
        field: "Password minimum length",
      });
    case "auth.session.ttl_ms":
      return normalizeInteger(value, {
        min: 60000,
        field: "Session TTL (ms)",
      });
    case "auth.cookie.name":
      return normalizeRequiredString(value, "Session cookie name");
    case "feature.guest.login.enabled":
      return normalizeBoolean(value, "Guest login toggle");
    case "feature.guest.login.enabled.bypass":
      return normalizeBoolean(value, "Guest login bypass toggle");
    case "feature.terms.require_acceptance":
      return normalizeBoolean(value, "Terms acceptance toggle");
    case "ui.date.format": {
      const normalized = normalizeString(value, { allowEmpty: false });
      if (!ALLOWED_DATE_FORMATS.has(normalized)) {
        throw new Error(
          "Date format must be one of: " + Array.from(ALLOWED_DATE_FORMATS).join(", ")
        );
      }
      return normalized;
    }
    case "env.locale.default":
      return normalizeLocale(value, "Default locale");
    case "env.locale.supported":
      return normalizeLocaleList(value);
    case "env.currency.default":
      return normalizeCurrency(value);
    case "env.timezone.default":
      return normalizeRequiredString(value, "Default timezone");
    case "email.from.name":
      return normalizeOptionalString(value);
    case "email.from.address":
      return normalizeEmailAddress(value, "From address");
    case "email.reply_to":
      return normalizeEmailAddress(value, "Reply-To address");
    case "feature.email.delivery.bypass":
      return normalizeBoolean(value, "Email delivery bypass toggle");
    case "email.smtp.url":
      return normalizeSmtpUrl(value);
    case "email.smtp.host":
      return normalizeOptionalString(value);
    case "email.smtp.port": {
      if (value === null || value === undefined || value === "") return null;
      return normalizeInteger(value, { min: 1, field: "SMTP port" });
    }
    case "email.smtp.secure":
      return normalizeBoolean(value, "SMTP secure flag");
    case "email.smtp.ignore_tls":
      return normalizeBoolean(value, "SMTP ignore TLS flag");
    case "email.smtp.user":
      return normalizeOptionalString(value);
    case "email.smtp.password": {
      if (value === null || value === undefined) return null;
      const str = String(value);
      return str.length > 0 ? str : null;
    }
    default: {
      if (BOOLEAN_KEYS.has(key)) {
        return normalizeBoolean(value, key);
      }
      return value;
    }
  }
}

async function getAppSettings(req, res, _, { prisma, logger }) {
  try {
    const settings = await prisma.appSetting.findMany({
      where: { scope: DEFAULT_SCOPE },
      select: { key: true, value: true },
    });

    const payload = {};
    for (const entry of settings) {
      payload[entry.key] = entry.value ?? null;
    }

    const version = await prisma.versionRegistry.findUnique({
      where: { id: "appsettings" },
      select: { v: true },
    });

    return res.json({
      settings: payload,
      version: version?.v ?? 0,
    });
  } catch (err) {
    logger.error("✗ getAppSettings failed", err);
    return res.status(500).json({ error: "Failed to load settings" });
  }
}

async function updateAppSettings(req, res, _, { prisma, logger, refreshEnvCache }) {
  const payload = req.body;

  const rawUpdates = Array.isArray(payload)
    ? payload
    : Array.isArray(payload?.settings)
      ? payload.settings
      : null;

  if (!rawUpdates || rawUpdates.length === 0) {
    return res.status(400).json({ error: "No settings provided" });
  }

  const defaultScope =
    (typeof payload?.scope === "string" && payload.scope.trim()) || DEFAULT_SCOPE;

  const updates = [];
  const errors = [];

  for (let idx = 0; idx < rawUpdates.length; idx += 1) {
    const entry = rawUpdates[idx];
    if (!entry || typeof entry !== "object") {
      return res.status(400).json({ error: `Invalid settings entry at index ${idx}` });
    }

    const key = typeof entry.key === "string" ? entry.key.trim() : "";
    if (!key) {
      return res.status(400).json({ error: `Missing key for settings entry at index ${idx}` });
    }
    if (key.length > KEY_MAX_LENGTH) {
      return res.status(400).json({ error: `Key too long for settings entry at index ${idx}` });
    }

    const scope =
      typeof entry.scope === "string" && entry.scope.trim() ? entry.scope.trim() : defaultScope;

    try {
      const normalizedValue = normalizeSettingValue(key, entry.value);
      updates.push({
        scope,
        key,
        value: normalizedValue,
      });
    } catch (err) {
      errors.push(`Key "${key}": ${err?.message || "Invalid value provided"}`);
    }
  }

  if (errors.length > 0) {
    return res.status(400).json({
      error: "Validation failed",
      details: errors,
    });
  }

  if (updates.length === 0) {
    return res.status(400).json({ error: "No valid settings provided" });
  }

  try {
    const updatedSettings = await prisma.$transaction(
      updates.map(({ scope, key, value }) =>
        prisma.appSetting.upsert({
          where: { scope_key: { scope, key } },
          update: { value },
          create: { scope, key, value },
          select: { key: true, scope: true, value: true },
        })
      )
    );

    const version = await prisma.versionRegistry.upsert({
      where: { id: "appsettings" },
      update: { v: { increment: 1 }, updatedAt: new Date() },
      create: { id: "appsettings", v: 1 },
      select: { v: true },
    });

    await refreshEnvCache({ force: true });

    return res.json({
      updated: updatedSettings,
      version: version.v,
    });
  } catch (err) {
    logger.error("✗ updateAppSettings failed", err);
    return res.status(500).json({ error: "Failed to update settings" });
  }
}

async function listPlugins(req, res, _, { prisma, logger }) {
  try {
    const plugins = await prisma.plugin.findMany({
      select: PLUGIN_SELECT,
      orderBy: { namespace: "asc" },
    });
    return res.json({ plugins });
  } catch (err) {
    logger.error("✗ listPlugins failed", err);
    return res.status(500).json({ error: "Failed to load plugins" });
  }
}

function normalizePluginUpdate(entry, idx) {
  const pluginId = typeof entry?.pluginId === "string" ? entry.pluginId.trim() : "";
  const namespace = typeof entry?.namespace === "string" ? entry.namespace.trim() : "";
  if (!pluginId && !namespace) {
    throw new Error(`Entry ${idx}: pluginId or namespace is required`);
  }

  let enabledFlag = null;
  if ("enabled" in entry) {
    const parsed = parseBooleanLike(entry.enabled);
    if (parsed === null) throw new Error(`Entry ${idx}: enabled must be a boolean`);
    enabledFlag = parsed;
  }

  let devOnlyFlag = null;
  if ("devOnly" in entry) {
    const parsed = parseBooleanLike(entry.devOnly);
    if (parsed === null) throw new Error(`Entry ${idx}: devOnly must be a boolean`);
    devOnlyFlag = parsed;
  }

  if (enabledFlag === null && devOnlyFlag === null) {
    throw new Error(`Entry ${idx}: no fields to update`);
  }

  const now = new Date();
  const data = {};
  if (enabledFlag !== null) {
    data.enabled = enabledFlag;
    data.enabledAt = enabledFlag ? now : null;
    data.disabledAt = enabledFlag ? null : now;
  }
  if (devOnlyFlag !== null) {
    data.devOnly = devOnlyFlag;
  }

  return {
    where: pluginId ? { pluginId } : { namespace },
    data,
  };
}

async function updatePlugins(req, res, _, { prisma, logger }) {
  const entries = Array.isArray(req.body?.plugins) ? req.body.plugins : null;
  if (!entries || entries.length === 0) {
    return res.status(400).json({ error: "No plugins provided" });
  }

  const updates = [];
  const errors = [];
  for (let idx = 0; idx < entries.length; idx += 1) {
    try {
      updates.push(normalizePluginUpdate(entries[idx], idx));
    } catch (err) {
      errors.push(err.message || `Entry ${idx}: invalid payload`);
    }
  }

  if (errors.length > 0) {
    return res.status(400).json({ error: "Validation failed", details: errors });
  }

  const updated = [];
  const missing = [];
  for (const update of updates) {
    try {
      const row = await prisma.plugin.update({
        where: update.where,
        data: update.data,
        select: PLUGIN_SELECT,
      });
      updated.push(row);
    } catch (err) {
      if (err?.code === "P2025") {
        const ref = update.where.pluginId || update.where.namespace;
        missing.push(`Plugin not found: ${ref}`);
        continue;
      }
      logger.error("✗ updatePlugins failed", err);
      return res.status(500).json({ error: "Failed to update plugins" });
    }
  }

  if (missing.length > 0) {
    return res.status(404).json({ error: "One or more plugins were not found", details: missing });
  }

  updatePluginRuntimeState(updated);

  return res.json({ plugins: updated });
}

export default (ctx) => {
  const router = express.Router();

  router.get("/plugins", (req, res, next) => listPlugins(req, res, next, ctx));
  router.patch("/plugins", (req, res, next) => updatePlugins(req, res, next, ctx));

  router.get("/", (req, res, next) => {
    return getAppSettings(req, res, next, ctx);
  });

  router.patch("/", (req, res, next) => {
    return updateAppSettings(req, res, next, ctx);
  });

  return router;
};
