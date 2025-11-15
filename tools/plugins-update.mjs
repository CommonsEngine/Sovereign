import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

import { PrismaClient } from "@prisma/client";
import fg from "fast-glob";
import { execa } from "execa";

const prisma = new PrismaClient();
const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const pluginsDir = path.join(repoRoot, "plugins");

async function loadPluginManifests() {
  const matches = await fg("*/plugin.json", { cwd: pluginsDir, absolute: true });
  const manifests = [];

  for (const manifestPath of matches) {
    try {
      const raw = await fs.readFile(manifestPath, "utf8");
      const manifest = JSON.parse(raw);
      const namespace = manifest.namespace || path.basename(path.dirname(manifestPath));
      const pluginId = manifest.id || namespace;
      const type = (manifest.type || "module").toLowerCase() === "project" ? "project" : "module";
      const enabled = manifest.enabled !== false;

      manifests.push({
        pluginId,
        namespace,
        name: manifest.name || namespace,
        description: manifest.description || null,
        version: manifest.version || "0.0.0",
        type,
        devOnly: manifest.devOnly === true,
        enabled,
        corePlugin: manifest.corePlugin === true,
      });
    } catch (error) {
      console.warn(`⚠️  Skipping ${manifestPath}: ${error.message}`);
    }
  }

  return manifests;
}

async function main() {
  const existing = await prisma.plugin.findMany({ select: { namespace: true } });
  const existingNamespaces = new Set(existing.map((plugin) => plugin.namespace));
  const manifests = await loadPluginManifests();
  const newPlugins = manifests.filter((plugin) => !existingNamespaces.has(plugin.namespace));

  if (!newPlugins.length) {
    console.log("No new plugins found. Skipping manifest build.");
    return;
  }

  console.log(
    `Found ${newPlugins.length} new plugin(s): ${newPlugins.map((p) => p.namespace).join(", ")}`
  );

  await execa("yarn", ["build:manifest"], { cwd: repoRoot, stdio: "inherit" });

  for (const plugin of newPlugins) {
    const payload = {
      namespace: plugin.namespace,
      name: plugin.name,
      description: plugin.description,
      version: plugin.version,
      type: plugin.type,
      devOnly: plugin.devOnly,
      enabled: plugin.enabled,
      corePlugin: plugin.corePlugin,
      enabledAt: plugin.enabled ? new Date() : null,
      lastValidatedAt: new Date(),
    };

    await prisma.plugin.upsert({
      where: { pluginId: plugin.pluginId },
      update: payload,
      create: { pluginId: plugin.pluginId, ...payload },
    });

    console.log(`✓ Updated plugin ${plugin.namespace}`);
  }

  try {
    await execa("pm2", ["reload", "sovereign"], { stdio: "inherit" });
  } catch (error) {
    if (error.code === "ENOENT") {
      console.warn("⚠️  pm2 not found; skipping reload.");
    } else {
      throw error;
    }
  }
}

async function run() {
  try {
    await main();
  } catch (error) {
    console.error("✗ Plugin update failed:", error);
    process.exitCode = 1;
  } finally {
    await prisma.$disconnect();
  }
}

if (import.meta.url === pathToFileURL(process.argv[1] || "").href) {
  run();
}
