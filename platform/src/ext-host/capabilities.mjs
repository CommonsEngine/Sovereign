import { prisma } from "$/services/database.mjs";
import * as git from "$/libs/git/registry.mjs";
import fm from "$/libs/fs.mjs";
import * as mailer from "$/services/mailer.mjs";
import { uuid } from "$/utils/id.mjs";
import { refreshEnvCache } from "$/config/env.mjs";

export const DEV_ALLOW_ALL_CAPS = process.env.DEV_ALLOW_ALL_CAPS === "true";

const capabilityRegistry = {
  database: {
    key: "database",
    provides: "prisma",
    description: "Read/write access to the primary database via Prisma client",
    risk: "critical",
    resolve: () => prisma,
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
    if (config.IS_PROD && capability.disabledInProd) {
      throw new Error(
        `Capability "${key}" requested by plugin ${namespace} is disabled in production`
      );
    }

    const targetProp = capability.provides || key;
    if (!(targetProp in injected)) {
      injected[targetProp] = capability.resolve({ plugin, config });
      granted.push(key);
    }
  }

  if (allowAll && granted.length) {
    logger?.warn?.(
      `[plugins] ${namespace}: DEV_ALLOW_ALL_CAPS enabled, granting capabilities: ${granted.join(", ")}`
    );
  }

  return { context: injected, granted };
}
