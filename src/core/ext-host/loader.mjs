import fs from "fs/promises";
import path from "path";

import { validateManifest } from "./manifestValidator.mjs";

function normalizeMountPath(value) {
  if (typeof value !== "string") return null;
  let result = value.trim();
  if (!result) return null;
  if (!result.startsWith("/")) {
    result = `/${result}`;
  }
  if (result.length > 1 && result.endsWith("/")) {
    result = result.replace(/\/+$/, "");
    if (!result.startsWith("/")) result = `/${result}`;
    if (result === "") result = "/";
  }
  return result;
}

function normalizeMounts(mounts = {}, { logger, manifestPath } = {}) {
  const normalized = {};
  for (const [key, rawValue] of Object.entries(mounts)) {
    const pathValue = normalizeMountPath(rawValue);
    if (!pathValue) {
      logger?.warn?.(
        formatError(`mount "${key}" is empty or invalid; skipping`, {
          manifestPath,
        }),
      );
      continue;
    }
    normalized[key] = pathValue;
  }
  return normalized;
}

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

    if (!parsed.enabled) break;

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

    const normalizedManifest = {
      ...validation.manifest,
      id: validation.manifest.name || entry.name,
      directoryName: entry.name,
      manifestPath,
      absoluteDir: pluginDir,
      mounts: normalizeMounts(validation.manifest.mounts, {
        logger,
        manifestPath,
      }),
    };

    manifests.push(normalizedManifest);
  }

  manifests.sort((a, b) => a.id.localeCompare(b.id));

  return manifests;
}
