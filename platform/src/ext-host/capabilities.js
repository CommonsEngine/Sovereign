import { prisma } from "$/services/database.js";
import * as git from "$/libs/git/registry.js";
import fm from "$/libs/fs.js";
import * as mailer from "$/services/mailer.js";
import { uuid } from "$/utils/id.js";
import { refreshEnvCache } from "$/config/env.js";

import { PluginCapabilityError } from "./plugin-auth.js";

export const DEV_ALLOW_ALL_CAPS = process.env.DEV_ALLOW_ALL_CAPS === "true";

const SENSITIVE_MODELS = new Set([
  "User",
  "UserProfile",
  "UserEmail",
  "UserRole",
  "UserRoleAssignment",
  "UserRoleCapability",
  "UserCapability",
  "Session",
  "PasskeyCredential",
  "PasskeyChallenge",
  "VerificationToken",
  "PasswordResetToken",
  "Invite",
  "AuditLog",
  "Tenant",
]);

function normalizeNamespace(value) {
  return String(value || "")
    .replace(/^@[^/]+\/+/, "")
    .trim()
    .toLowerCase();
}

function isWhitelistedForSensitiveModels(plugin, config = {}) {
  const configured = Array.isArray(config.SENSITIVE_PLUGIN_ALLOWLIST)
    ? config.SENSITIVE_PLUGIN_ALLOWLIST
    : [];
  const allowlist = new Set(configured.map((item) => normalizeNamespace(item)));

  const ns = normalizeNamespace(plugin?.namespace);
  const id = normalizeNamespace(plugin?.id);
  return allowlist.has(ns) || allowlist.has(id);
}

function getPrismaForPlugin(plugin, config = {}) {
  const namespace = (plugin?.namespace || plugin?.id || "<unknown>").toString();

  const isWhitelistedCore =
    plugin?.corePlugin === true && isWhitelistedForSensitiveModels(plugin, config);

  if (isWhitelistedCore) return prisma;

  return prisma.$extends({
    name: `plugin-guard:${namespace}`,
    query: {
      $allModels: {
        async $allOperations({ model }, next) {
          if (SENSITIVE_MODELS.has(model)) {
            throw new PluginCapabilityError(
              `Plugin "${namespace}" is not allowed to access model "${model}"`,
              {
                status: 403,
                code: "ERR_PLUGIN_DATA_ACCESS",
                meta: { namespace, model },
              }
            );
          }
          return next();
        },
      },
    },
  });
}

const capabilityRegistry = {
  database: {
    key: "database",
    provides: "prisma",
    description: "Read/write access to the primary database via Prisma client",
    risk: "critical",
    resolve: ({ plugin, config }) => getPrismaForPlugin(plugin, config),
  },
  git: {
    key: "git",
    provides: "git",
    description: "Git registry helpers for content sync",
    risk: "high",
    resolve: () => git,
  },
  fs: {
    key: "fs",
    provides: "fm",
    description: "File-system helper scoped to plugin storage",
    risk: "high",
    resolve: () => fm,
  },
  env: {
    key: "env",
    provides: "refreshEnvCache",
    description: "Ability to refresh platform environment cache",
    risk: "medium",
    resolve: () => refreshEnvCache,
  },
  uuid: {
    key: "uuid",
    provides: "uuid",
    description: "UUID helpers for deterministic ids",
    risk: "low",
    resolve: () => uuid,
  },
  mailer: {
    key: "mailer",
    provides: "mailer",
    description: "Transactional mailer client",
    risk: "high",
    resolve: () => mailer,
  },
  fileUpload: {
    key: "fileUpload",
    provides: "fileUpload",
    description: "Temporary file upload helpers (disabled in prod until hardened)",
    risk: "medium",
    disabledInProd: true,
    enabledFlag: "CAPABILITY_FILE_UPLOAD_ENABLED",
    resolve: () => ({}), // TODO: wire real upload service
  },
};

export function getCapabilityRegistry() {
  return capabilityRegistry;
}

export function resolvePluginCapabilities(plugin = {}, { config = {}, logger } = {}) {
  const namespace = plugin.namespace || plugin.id || "<unknown>";
  const requested = plugin?.sovereign?.platformCapabilities || plugin?.platformCapabilities || {};
  const allowAll = !config.IS_PROD && DEV_ALLOW_ALL_CAPS;

  const requestedEntries = allowAll
    ? Object.keys(capabilityRegistry).map((key) => [key, true])
    : Object.entries(requested);

  const injected = {};
  const granted = [];

  for (const [key, enabled] of requestedEntries) {
    if (!enabled && !allowAll) continue;
    const capability = capabilityRegistry[key];
    if (!capability) {
      throw new Error(`Unknown platform capability "${key}" requested by plugin ${namespace}`);
    }
    const enabledFlagName = capability.enabledFlag;
    const overrideEnabled =
      typeof enabledFlagName === "string" &&
      Object.prototype.hasOwnProperty.call(config, enabledFlagName)
        ? Boolean(config[enabledFlagName])
        : false;

    if (config.IS_PROD && capability.disabledInProd && !overrideEnabled) {
      throw new Error(
        `Capability "${key}" requested by plugin ${namespace} is disabled in production`
      );
    }

    const targetProp = capability.provides || key;
    if (!(targetProp in injected)) {
      injected[targetProp] = capability.resolve({ plugin, config });
      granted.push(key);
    }
    if (config.IS_PROD && capability.disabledInProd && overrideEnabled) {
      logger?.warn?.(
        `[plugins] ${namespace}: capability "${key}" enabled via ${enabledFlagName}. Proceed with caution.`
      );
    }
  }

  if (allowAll && granted.length) {
    logger?.warn?.(
      `[plugins] ${namespace}: DEV_ALLOW_ALL_CAPS enabled, granting capabilities: ${granted.join(", ")}`
    );
  }

  return { context: injected, granted };
}
