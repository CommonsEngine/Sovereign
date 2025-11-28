import { prisma } from "$/services/database.js";
import logger from "$/services/logger.js";

import { seedPluginRuntimeState } from "./plugin-state.js";

function indexDbPlugins(rows = []) {
  const byNamespace = new Map();
  const byPluginId = new Map();
  rows.forEach((row) => {
    if (row.namespace) byNamespace.set(row.namespace, row);
    if (row.pluginId) byPluginId.set(row.pluginId, row);
  });
  return { byNamespace, byPluginId };
}

function mergePlugin(manifestPlugin, dbPlugin) {
  if (!dbPlugin) return manifestPlugin;
  return {
    ...manifestPlugin,
    type: dbPlugin.type || manifestPlugin.type,
    enabled: dbPlugin.enabled ?? manifestPlugin.enabled,
    userDefaultEnabled:
      dbPlugin.userDefaultEnabled ??
      manifestPlugin.userDefaultEnabled ??
      (manifestPlugin.corePlugin === true ? true : true),
    corePlugin: dbPlugin.corePlugin ?? manifestPlugin.corePlugin,
    devOnly: dbPlugin.devOnly ?? manifestPlugin.devOnly,
    version: dbPlugin.version || manifestPlugin.version,
  };
}

export default async function createExtHost(manifest) {
  let dbPlugins = [];
  try {
    dbPlugins = await prisma.plugin.findMany();
  } catch (err) {
    logger.warn(
      `⚠️  Failed to fetch plugins from database; falling back to manifest. ${err?.message || err}`
    );
  }

  const { byNamespace, byPluginId } = indexDbPlugins(dbPlugins);
  const normalizedPlugins = {};
  const enabledPlugins = [];

  for (const [ns, plugin] of Object.entries(manifest.plugins || {})) {
    const dbMatch = byNamespace.get(ns) || byPluginId.get(plugin?.id);
    const merged = mergePlugin(plugin, dbMatch);
    const isDevOnly = merged.devOnly === true;
    if (isDevOnly && process.env.NODE_ENV !== "development") {
      continue;
    }
    normalizedPlugins[ns] = merged;
    if (merged.enabled !== false) {
      const token = `${ns}@${merged.version || plugin?.version || "0.0.0"}`;
      enabledPlugins.push(token);
    }
  }

  // If DB returned no rows, fall back to manifest enabledPlugins for consistency
  const finalEnabled =
    dbPlugins.length === 0 && Array.isArray(manifest.enabledPlugins)
      ? manifest.enabledPlugins.filter((token) => {
          const namespace = typeof token === "string" ? token.split("@")[0] : null;
          return namespace && normalizedPlugins[namespace];
        })
      : enabledPlugins;

  seedPluginRuntimeState(normalizedPlugins);

  return {
    ...manifest,
    plugins: normalizedPlugins,
    enabledPlugins: finalEnabled,
    __assets: manifest.__assets,
  };
}
