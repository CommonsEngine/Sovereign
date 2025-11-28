import { prisma } from "./database.js";
import logger from "./logger.js";

const DEFAULT_ENROLL_STRATEGY = "auto";

function resolveEnrollStrategy(plugin) {
  if (!plugin) return DEFAULT_ENROLL_STRATEGY;
  if (plugin.corePlugin === true) return "auto";
  return plugin.enrollStrategy === "subscribe" ? "subscribe" : "auto";
}

function evaluatePluginForUser(plugin, override) {
  const strategy = resolveEnrollStrategy(plugin);
  const defaultEnabled = strategy !== "subscribe";
  const overrideEnabled = typeof override?.enabled === "boolean" ? Boolean(override.enabled) : null;
  const enabled =
    plugin.corePlugin === true ? true : overrideEnabled !== null ? overrideEnabled : defaultEnabled;

  let source = "default";
  if (plugin.corePlugin) {
    source = "core";
  } else if (overrideEnabled !== null) {
    source = overrideEnabled ? "explicit" : "disabled";
  } else if (strategy === "subscribe") {
    source = "opt-in";
  }

  return {
    enabled,
    defaultEnabled,
    overrideEnabled,
    overridden: overrideEnabled !== null,
    enrollStrategy: strategy,
    source,
  };
}

function buildUserPluginSnapshot(plugins = [], overrides = []) {
  const overrideByPluginId = new Map();
  overrides.forEach((ovr) => {
    if (ovr?.pluginId) {
      overrideByPluginId.set(ovr.pluginId, ovr);
    }
  });

  const enabled = [];
  const disabled = [];
  const pluginStates = [];

  for (const plugin of plugins) {
    const override = overrideByPluginId.get(plugin.id);
    const state = evaluatePluginForUser(plugin, override);
    if (state.enabled) enabled.push(plugin.namespace);
    if (override && override.enabled === false && plugin.corePlugin !== true) {
      disabled.push(plugin.namespace);
    }
    pluginStates.push({
      pluginId: plugin.pluginId,
      namespace: plugin.namespace,
      name: plugin.name,
      description: plugin.description,
      type: plugin.type,
      corePlugin: plugin.corePlugin === true,
      defaultEnabled: state.defaultEnabled,
      enrollStrategy: state.enrollStrategy,
      enabled: state.enabled,
      overridden: state.overridden,
      overrideEnabled: state.overrideEnabled,
      source: state.source,
      globallyEnabled: plugin.enabled !== false,
    });
  }

  pluginStates.sort((a, b) => a.name.localeCompare(b.name));

  return { enabled, disabled, plugins: pluginStates };
}

export async function getUserPluginSnapshots(
  userIds = [],
  { prisma: client, includeDisabled } = {}
) {
  const ids = Array.from(
    new Set(
      (Array.isArray(userIds) ? userIds : [userIds])
        .map((id) => (typeof id === "string" ? id.trim() : ""))
        .filter(Boolean)
    )
  );
  if (!ids.length) return new Map();

  const db = client || prisma;
  const plugins = await db.plugin.findMany({
    where: includeDisabled ? {} : { enabled: true },
    select: {
      id: true,
      pluginId: true,
      namespace: true,
      name: true,
      description: true,
      type: true,
      enabled: true,
      corePlugin: true,
      enrollStrategy: true,
    },
  });

  const overrides = await db.userPlugin.findMany({
    where: { userId: { in: ids } },
    select: {
      userId: true,
      pluginId: true,
      enabled: true,
      plugin: { select: { namespace: true } },
    },
  });

  const overridesByUser = new Map();
  overrides.forEach((row) => {
    if (!row?.userId) return;
    const existing = overridesByUser.get(row.userId) || [];
    existing.push(row);
    overridesByUser.set(row.userId, existing);
  });

  const result = new Map();
  ids.forEach((userId) => {
    const userOverrides = overridesByUser.get(userId) || [];
    result.set(userId, buildUserPluginSnapshot(plugins, userOverrides));
  });
  return result;
}

export async function getUserPluginSnapshot(userId, options = {}) {
  const snapshots = await getUserPluginSnapshots([userId], options);
  return snapshots.get(userId) || { enabled: [], disabled: [], plugins: [] };
}

export async function applyUserPluginUpdates(
  userId,
  updates = [],
  { prisma: client, logger: log = logger } = {}
) {
  const db = client || prisma;
  const normalized = Array.isArray(updates)
    ? updates
        .map((entry) => ({
          namespace:
            typeof entry?.namespace === "string" && entry.namespace.trim()
              ? entry.namespace.trim()
              : null,
          pluginId:
            typeof entry?.pluginId === "string" && entry.pluginId.trim()
              ? entry.pluginId.trim()
              : null,
          enabled: entry?.enabled === true ? true : entry?.enabled === false ? false : null,
        }))
        .filter((entry) => (entry.namespace || entry.pluginId) && entry.enabled !== null)
    : [];

  if (!normalized.length) {
    return { updated: 0, snapshot: await getUserPluginSnapshot(userId, { prisma: db }) };
  }

  const plugins = await db.plugin.findMany({
    where: { enabled: true },
    select: {
      id: true,
      pluginId: true,
      namespace: true,
      name: true,
      corePlugin: true,
      enrollStrategy: true,
    },
  });

  const pluginIndex = new Map();
  plugins.forEach((plugin) => {
    if (plugin.namespace) pluginIndex.set(plugin.namespace, plugin);
    if (plugin.pluginId) pluginIndex.set(plugin.pluginId, plugin);
  });

  const existingOverrides = await db.userPlugin.findMany({
    where: { userId },
    select: { id: true, pluginId: true, enabled: true },
  });
  const overrideByPluginId = new Map(existingOverrides.map((row) => [row.pluginId, row]));

  let updated = 0;
  for (const entry of normalized) {
    const plugin =
      pluginIndex.get(entry.namespace) || pluginIndex.get(entry.pluginId || entry.namespace);
    if (!plugin) {
      log?.warn?.(`[user-plugins] Unknown plugin in update payload`, entry);
      continue;
    }
    if (plugin.corePlugin && entry.enabled === false) {
      log?.warn?.(
        `[user-plugins] Ignoring attempt to disable core plugin "${plugin.namespace}" for user ${userId}`
      );
      continue;
    }

    const strategy = resolveEnrollStrategy(plugin);
    const defaultEnabled = strategy !== "subscribe";
    const override = overrideByPluginId.get(plugin.id);

    if (entry.enabled === defaultEnabled) {
      if (override) {
        await db.userPlugin.delete({
          where: { userId_pluginId: { userId, pluginId: plugin.id } },
        });
        updated += 1;
      }
      continue;
    }

    await db.userPlugin.upsert({
      where: { userId_pluginId: { userId, pluginId: plugin.id } },
      update: { enabled: entry.enabled },
      create: { userId, pluginId: plugin.id, enabled: entry.enabled },
    });
    updated += 1;
  }

  const snapshot = await getUserPluginSnapshot(userId, { prisma: db });
  return { updated, snapshot };
}
