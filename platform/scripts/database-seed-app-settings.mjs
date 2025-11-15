import "dotenv/config";

import { createRequire } from "module";

const require = createRequire(import.meta.url);
const manifest = require("../../manifest.json");

function parseBoolLike(v) {
  const s = String(v ?? "")
    .trim()
    .toLowerCase();
  if (["true", "1", "yes", "on"].includes(s)) return "true";
  if (["false", "0", "no", "off"].includes(s)) return "false";
  return null;
}

const defaultConfigs = [
  {
    scope: "platform",
    key: "env.app.name",
    value: process.env.APP_NAME ?? manifest.platform.title ?? "Sovereign",
  },
  {
    scope: "platform",
    key: "env.app.tagline",
    value: process.env.APP_TAGLINE ?? manifest.platform.tagline ?? "Reclaim your digital freedom.",
  },
  {
    scope: "platform",
    key: "env.app.description",
    value:
      process.env.APP_DESCRIPTION ?? manifest.platform.description ?? "A Sovereign application",
  },
  {
    scope: "platform",
    key: "env.app.version",
    value: process.env.APP_VERSION ?? manifest.platform.version ?? "0.1.0",
  },
  {
    scope: "platform",
    key: "env.app.url",
    value: process.env.APP_URL ?? "http://localhost:3000",
  },
  {
    scope: "platform",
    key: "feature.guest.login.enabled",
    value: parseBoolLike(process.env.GUEST_LOGIN_ENABLED) ?? "false",
  },
  {
    scope: "platform",
    key: "feature.email.delivery.bypass",
    value: parseBoolLike(process.env.EMAIL_DELIVERY_BYPASS) ?? "true",
  },
  {
    scope: "platform",
    key: "email.from.name",
    value:
      process.env.EMAIL_FROM_NAME ?? process.env.APP_NAME ?? manifest.platfom.title ?? "Sovereign",
  },
  {
    scope: "platform",
    key: "email.from.address",
    value: process.env.EMAIL_FROM_ADDRESS ?? process.env.EMAIL_FROM ?? "no-reply@localhost",
  },
  {
    scope: "platform",
    key: "email.reply_to",
    value: process.env.EMAIL_REPLY_TO ?? "",
  },
  {
    scope: "platform",
    key: "email.smtp.url",
    value: process.env.EMAIL_SMTP_URL ?? "",
  },
  {
    scope: "platform",
    key: "email.smtp.host",
    value: process.env.EMAIL_SMTP_HOST ?? "",
  },
  {
    scope: "platform",
    key: "email.smtp.port",
    value:
      process.env.EMAIL_SMTP_PORT && !Number.isNaN(Number(process.env.EMAIL_SMTP_PORT))
        ? Number(process.env.EMAIL_SMTP_PORT)
        : 587,
  },
  {
    scope: "platform",
    key: "email.smtp.secure",
    value: parseBoolLike(process.env.EMAIL_SMTP_SECURE) ?? "false",
  },
  {
    scope: "platform",
    key: "email.smtp.ignore_tls",
    value: parseBoolLike(process.env.EMAIL_SMTP_IGNORE_TLS) ?? "false",
  },
  {
    scope: "platform",
    key: "email.smtp.user",
    value: process.env.EMAIL_SMTP_USER ?? "",
  },
  {
    scope: "platform",
    key: "email.smtp.password",
    value: process.env.EMAIL_SMTP_PASSWORD ?? "",
  },
  {
    scope: "platform",
    key: "feature.guest.login.enabled.bypass",
    value: parseBoolLike(process.env.GUEST_LOGIN_ENABLED_BYPASS_LOGIN) ?? "false",
  },
  {
    scope: "platform",
    key: "env.locale.default",
    value: process.env.DEFAULT_LOCALE ?? "en-US",
  },
  {
    scope: "platform",
    key: "env.locale.supported",
    value: process.env.SUPPORTED_LOCALES
      ? process.env.SUPPORTED_LOCALES.split(",").map((s) => s.trim())
      : ["en-US", "en-GB"],
  },
  {
    scope: "platform",
    key: "env.timezone.default",
    value: process.env.DEFAULT_TIMEZONE ?? "UTC",
  },
  {
    scope: "platform",
    key: "env.currency.default",
    value: process.env.DEFAULT_CURRENCY ?? "USD",
  },
  {
    scope: "platform",
    key: "auth.password.min_length",
    value: Number(process.env.AUTH_PASSWORD_MIN_LENGTH ?? 8),
  },
  {
    scope: "platform",
    key: "auth.session.ttl_ms",
    value: Number(process.env.AUTH_SESSION_TTL_MS ?? 24 * 60 * 60 * 1000),
  },
  {
    scope: "platform",
    key: "auth.cookie.name",
    value: process.env.AUTH_SESSION_COOKIE_NAME ?? "svg_session",
  },
  {
    scope: "platform",
    key: "signup.policy",
    value: process.env.SIGNUP_POLICY ?? "invite", // 'open' or 'invite'
  },
  {
    scope: "platform",
    key: "default.user.role",
    value: process.env.DEFAULT_USER_ROLE ?? "guest",
  },
  {
    scope: "platform",
    key: "feature.terms.require_acceptance",
    value: parseBoolLike(process.env.FEATURE_TERMS_REQUIRE_ACCEPTANCE) ?? "false",
  },
];

export default async function seedAppSettings(prisma) {
  if (!prisma) {
    throw new Error("seedAppSettings requires a Prisma client instance");
  }

  // Optional whitelist for feature envs: comma separated names (without FT_)
  const allowedCsv = process.env.ALLOWED_FEATURES || "";
  const allowed = allowedCsv
    .split(",")
    .map((s) => s.trim().toLowerCase())
    .filter(Boolean);
  const allowAll = allowed.length === 0;

  const featureToggles = Object.keys(process.env)
    .filter((k) => k.startsWith("FT_"))
    .map((t) => {
      const raw = t.slice(3); // drop FT_
      const keyName = raw.toLowerCase().replace(/_/g, ".");
      return {
        envKey: raw.toLowerCase(),
        configKey: `feature.${keyName}`,
        envName: t,
      };
    })
    .filter((f) => allowAll || allowed.includes(f.envKey))
    .map((f) => {
      const parsed = parseBoolLike(process.env[f.envName]);
      return {
        scope: "platform",
        key: f.configKey,
        value: parsed === null ? String(process.env[f.envName]) : parsed,
      };
    });

  const configs = [...defaultConfigs, ...featureToggles];

  for (const c of configs) {
    try {
      const found = await prisma.appSetting.findFirst({
        where: { scope: c.scope, key: c.key },
      });
      if (found) {
        await prisma.appSetting.update({
          where: { id: found.id },
          data: { value: c.value },
        });
      } else {
        await prisma.appSetting.create({
          data: {
            scope: c.scope,
            key: c.key,
            value: c.value,
          },
        });
      }
      console.log("✓ App config seeded:", c.key, "=", c.value);
    } catch (err) {
      console.warn("✗ Failed to upsert app config", c.key, err);
    }
  }

  try {
    // Update VersionRegistry
    const vrKey = "appsettings";
    const vr = await prisma.versionRegistry.upsert({
      where: { id: vrKey },
      update: {
        v: { increment: 1 },
        updatedAt: new Date(),
      },
      create: {
        id: vrKey,
        v: 1,
      },
    });
    console.log("✓ VersionRegistry entry:", vrKey, "version ->", vr.v);
  } catch (err) {
    console.warn("✗ Failed to update VersionRegistry", err);
  }
}
