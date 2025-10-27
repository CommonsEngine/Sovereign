import path from "path";
import fs from "fs/promises";

import logger from "$/services/logger.mjs";

function formatError(message, options = {}) {
  const { pluginDir, manifestPath } = options;
  const context = [pluginDir, manifestPath].filter(Boolean).join(" ");
  return context ? `${context}: ${message}` : message;
}

function resolvePluginsDir(pluginsDir) {
  if (!pluginsDir) {
    throw new Error("pluginsDir is required to initialize the extension host");
  }

  const parsed = path.isAbsolute(pluginsDir) ? pluginsDir : path.join(process.cwd(), pluginsDir);

  return parsed;
}

export default async function createExtHost(_, options = {}) {
  const __pluginsDir = resolvePluginsDir(options.pluginsDir);

  let pluginCandidates;

  const plugins = {};
  const enabledPlugins = [];
  const pluginsPublicAssetsDirs = [];

  // Read plugins directory to identify pluginCandidates
  try {
    pluginCandidates = await fs.readdir(__pluginsDir, { withFileTypes: true });
  } catch (err) {
    if (err.code === "ENOENT") {
      logger?.warn?.(`Extension host: plugins directory "${__pluginsDir}" does not exist.`);
      return {
        plugins: {},
        enabledPlugins: [],
        pluginsPublicAssetsDirs: [],
      };
    }
    throw err;
  }

  for (const candidate of pluginCandidates) {
    const namespace = candidate.name;
    const plugingRoot = path.join(candidate.parentPath, namespace);
    const pluginManifestPath = path.join(plugingRoot, "plugin.json");

    let pluginManifestSource;
    try {
      pluginManifestSource = await fs.readFile(pluginManifestPath, "utf8");
    } catch (err) {
      if (err.code === "ENOENT") {
        logger?.warn?.(formatError(`missing plugin.json file`, pluginManifestPath));
        continue;
      }
      throw err;
    }

    let pluginManifest;
    try {
      pluginManifest = JSON.parse(pluginManifestSource);
    } catch (err) {
      logger?.error?.(formatError(`invalid JSON: ${err.message}`, pluginManifestPath));
      continue;
    }

    const allowPlugin =
      (process.env.NODE_ENV === "production" || pluginManifest.devOnly) && !pluginManifest.draft;

    // TODO: Validate the schema
    // TODO: Normalize pluginManifest

    if (allowPlugin) {
      let entry = path.join(plugingRoot, "index.html");

      if (pluginManifest.type === "spa") {
        entry = path.join(plugingRoot, "dist", "index.js");

        pluginsPublicAssetsDirs.push({ base: "/", dir: path.join(plugingRoot, "dist", "assets") });
        pluginsPublicAssetsDirs.push({
          base: `/plugins/${namespace}/`,
          dir: path.join(plugingRoot, "dist"),
        });
      }
      pluginsPublicAssetsDirs.push({
        base: "/",
        dir: path.join(plugingRoot, "public"),
      });

      plugins[namespace] = {
        namespace,
        entry,
        plugingRoot,
        ...pluginManifest,
      };

      enabledPlugins.push(`${namespace}@${pluginManifest.version}`);
    }
  }

  return {
    plugins,
    enabledPlugins,
    pluginsPublicAssetsDirs,
  };
}
