import fs from "fs/promises";
import path from "path";

import { validateManifest } from "./manifestValidator.mjs";

function formatError(message, options = {}) {
  const { pluginDir, manifestPath } = options;
  const context = [pluginDir, manifestPath].filter(Boolean).join(" ");
  return context ? `${context}: ${message}` : message;
}

export async function discoverManifests(pluginsDir, options = {}) {
  const { logger } = options;

  let entries;
  try {
    entries = await fs.readdir(pluginsDir, { withFileTypes: true });
  } catch (err) {
    if (err.code === "ENOENT") {
      logger?.warn?.(
        `Extension host: plugins directory "${pluginsDir}" does not exist.`,
      );
      return [];
    }
    throw err;
  }

  const manifests = [];

  for (const entry of entries) {
    if (!entry.isDirectory()) continue;

    const pluginDir = path.join(pluginsDir, entry.name);
    const manifestPath = path.join(pluginDir, "plugin.json");

    let manifestSource;
    try {
      manifestSource = await fs.readFile(manifestPath, "utf8");
    } catch (err) {
      if (err.code === "ENOENT") {
        logger?.warn?.(
          formatError(`missing plugin.json file`, {
            pluginDir,
            manifestPath,
          }),
        );
        continue;
      }
      throw err;
    }

    let parsed;
    try {
      parsed = JSON.parse(manifestSource);
    } catch (err) {
      logger?.error?.(
        formatError(`invalid JSON: ${err.message}`, {
          pluginDir,
          manifestPath,
        }),
      );
      continue;
    }

    const validation = validateManifest(parsed, { manifestPath, pluginDir });
    if (!validation.success) {
      const issues = validation.issues
        .map((issue) => `- ${issue.message} (${issue.path})`)
        .join("\n");
      logger?.error?.(
        formatError(`manifest validation failed:\n${issues}`, {
          manifestPath,
        }),
      );
      continue;
    }

    manifests.push({
      ...validation.manifest,
      id: validation.manifest.name || entry.name,
      directoryName: entry.name,
      manifestPath,
      absoluteDir: pluginDir,
    });
  }

  manifests.sort((a, b) => a.id.localeCompare(b.id));

  return manifests;
}
