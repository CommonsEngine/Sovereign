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

  const parsed = path.isAbsolute(pluginsDir)
    ? pluginsDir
    : path.join(process.cwd(), pluginsDir);

  return parsed;
}

export default async function createExtHost(_, options = {}) {
  const __pluginsDir = resolvePluginsDir(options.pluginsDir);

  let pluginCandidates;
  const plugins = [];

  // Read plugins directory to identify pluginCandidates
  try {
    pluginCandidates = await fs.readdir(__pluginsDir, { withFileTypes: true });
  } catch (err) {
    if (err.code === "ENOENT") {
      logger?.warn?.(
        `Extension host: plugins directory "${__pluginsDir}" does not exist.`,
      );
      return [];
    }
    throw err;
  }

  for (const candidate of pluginCandidates) {
    if (!candidate.isDirectory()) continue;

    const pluginDir = path.join(__pluginsDir, candidate.name);
    const pluginManifestPath = path.join(pluginDir, "plugin.json");

    let pluginManifestSource;
    try {
      pluginManifestSource = await fs.readFile(pluginManifestPath, "utf8");
    } catch (err) {
      if (err.code === "ENOENT") {
        logger?.warn?.(
          formatError(`missing plugin.json file`, {
            pluginDir,
            pluginManifestPath,
          }),
        );
        continue;
      }
      throw err;
    }

    let pluginManifest;
    try {
      pluginManifest = JSON.parse(pluginManifestSource);
    } catch (err) {
      logger?.error?.(
        formatError(`invalid JSON: ${err.message}`, {
          pluginDir,
          pluginManifestPath,
        }),
      );
      continue;
    }

    if (!pluginManifest.isEnabled) break;

    // TODO: Validate the schema
    // TODO: Normalize pluginManifest

    plugins.push(pluginManifest);
  }

  return {
    plugins,
  };
}
