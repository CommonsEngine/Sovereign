/* eslint-disable import/order */
import { PrismaClient, Prisma } from "@prisma/client";
import fs from "node:fs/promises";
import path from "node:path";
import { pathToFileURL } from "node:url";
import fg from "fast-glob";

import {
  collectPluginCapabilities,
  repoRoot,
  summarizeCapabilityDiff,
  readPreviousCapabilityState,
  writeCapabilityState,
} from "./lib/plugin-capabilities.mjs";

const defaultStatePath = path.join(repoRoot, "data", "plugin-capabilities.lock.json");
const defaultManifestPath = path.join(repoRoot, "manifest.json");

function buildEnabledLookup(enabledList = []) {
  if (!Array.isArray(enabledList)) return new Set();
  return new Set(
    enabledList
      .map((token) => (typeof token === "string" ? token.trim().toLowerCase() : ""))
      .filter(Boolean)
  );
}

function normalizePluginDefinition(entryKey, plugin, enabledLookup, logger = console) {
  if (!plugin || typeof plugin !== "object") return null;
  const pluginIdRaw = typeof plugin.id === "string" ? plugin.id.trim() : "";
  if (!pluginIdRaw) {
    logger.warn(`⚠️  Skipping plugin entry "${entryKey}" due to missing id.`);
    return null;
  }
  const namespaceRaw =
    typeof plugin.namespace === "string" && plugin.namespace.trim().length
      ? plugin.namespace.trim()
      : entryKey;
  if (!namespaceRaw) {
    logger.warn(`⚠️  Skipping plugin "${pluginIdRaw}" due to missing namespace.`);
    return null;
  }
  const versionRaw = typeof plugin.version === "string" ? plugin.version.trim() : "";
  const version = versionRaw || "0.0.0";
  const enabledToken = `${namespaceRaw}@${version}`.toLowerCase();
  const enabledFlag = plugin.enabled === false ? false : enabledLookup.has(enabledToken);
  const enabled = plugin.enabled === false ? false : enabledFlag || plugin.enabled !== false;
  const typeRaw = typeof plugin.type === "string" ? plugin.type.toLowerCase() : "module";
  const normalizedType = typeRaw === "project" ? "project" : "module";
  const enrollStrategy =
    plugin.corePlugin === true
      ? "auto"
      : plugin.enrollStrategy === "subscribe"
        ? "subscribe"
        : "auto";

  return {
    pluginId: pluginIdRaw,
    namespace: namespaceRaw,
    name:
      typeof plugin.name === "string" && plugin.name.trim().length
        ? plugin.name.trim()
        : namespaceRaw,
    description:
      typeof plugin.description === "string" && plugin.description.trim().length
        ? plugin.description.trim()
        : null,
    version,
    type: normalizedType,
    devOnly: plugin.devOnly === true,
    enabled,
    enrollStrategy,
    corePlugin: plugin.corePlugin === true,
  };
}

async function loadManifest(manifestPath) {
  const raw = await fs.readFile(manifestPath, "utf8");
  return JSON.parse(raw);
}

function extractManifestPlugins(manifest, logger = console) {
  if (!manifest || typeof manifest !== "object") return [];
  const pluginMap =
    manifest.plugins && typeof manifest.plugins === "object" ? manifest.plugins : {};
  const enabledLookup = buildEnabledLookup(manifest.enabledPlugins || []);
  const plugins = [];
  for (const [key, plugin] of Object.entries(pluginMap)) {
    const normalized = normalizePluginDefinition(key, plugin, enabledLookup, logger);
    if (normalized) {
      plugins.push(normalized);
    }
  }
  return plugins;
}

async function collectRepoPlugins({ cwd = repoRoot, logger = console } = {}) {
  const matches = await fg("plugins/*/plugin.json", { cwd, absolute: true });
  const plugins = [];
  for (const manifestPath of matches) {
    try {
      const raw = await fs.readFile(manifestPath, "utf8");
      const manifest = JSON.parse(raw);
      const entryKey = path.basename(path.dirname(manifestPath));
      const normalized = normalizePluginDefinition(entryKey, manifest, new Set(), logger);
      if (normalized) {
        plugins.push(normalized);
      }
    } catch (err) {
      logger.warn(`⚠️  Failed to read plugin manifest ${manifestPath}: ${err?.message || err}`);
    }
  }
  return plugins;
}

async function seedPluginDefinitions(client, pluginDefinitions, logger) {
  if (!pluginDefinitions.length) {
    logger.log("ℹ️  No plugin definitions found in manifest.");
    return 0;
  }
  let seeded = 0;
  for (const definition of pluginDefinitions) {
    const basePayload = {
      namespace: definition.namespace,
      name: definition.name,
      description: definition.description,
      version: definition.version,
      type: definition.type,
      devOnly: definition.devOnly,
      enabled: definition.enabled,
      enrollStrategy: definition.enrollStrategy,
      enabledAt: definition.enabled ? new Date() : null,
      corePlugin: definition.corePlugin,
      lastValidatedAt: new Date(),
    };
    await client.plugin.upsert({
      where: { pluginId: definition.pluginId },
      update: basePayload,
      create: {
        pluginId: definition.pluginId,
        ...basePayload,
      },
    });
    seeded += 1;
  }
  logger.log(`✓ Seeded ${seeded} plugin definition(s).`);
  return seeded;
}

export async function seedPlugins({
  prisma,
  logger = console,
  cwd = repoRoot,
  statePath = defaultStatePath,
  manifestPath,
} = {}) {
  const client = prisma || new PrismaClient();
  const shouldDisconnect = !prisma;
  const resolvedManifestPath = manifestPath || defaultManifestPath;

  try {
    let manifest;
    try {
      manifest = await loadManifest(resolvedManifestPath);
    } catch (err) {
      logger.warn(`⚠️  Failed to read manifest at ${resolvedManifestPath}: ${err?.message || err}`);
      manifest = null;
    }
    let pluginDefinitions = extractManifestPlugins(manifest, logger);
    if (!pluginDefinitions.length) {
      logger.warn("⚠️  No plugins found in manifest; falling back to plugin.json files.");
      pluginDefinitions = await collectRepoPlugins({ cwd, logger });
    }
    await seedPluginDefinitions(client, pluginDefinitions, logger);

    const { capabilities, diagnostics, signature } = await collectPluginCapabilities({ cwd });
    diagnostics.forEach((diag) => {
      if (diag.level === "error") {
        logger.error(`✗ ${diag.message}`);
      } else {
        logger.warn(`⚠️  ${diag.message}`);
      }
    });

    if (!capabilities.length) {
      logger.log("ℹ️  No plugin capabilities to seed.");
      return;
    }

    const roles = await client.userRole.findMany({ select: { id: true, key: true } });
    const roleMap = new Map(roles.map((role) => [role.key, role]));
    let seeded = 0;
    for (const capability of capabilities) {
      await client.userCapability.upsert({
        where: { key: capability.key },
        update: {
          description: capability.description,
          source: capability.source,
          scope: capability.scope,
          category: capability.category,
          metadata: capability.metadata || Prisma.JsonNull,
          tags: capability.tags || Prisma.JsonNull,
          namespace: capability.namespace,
        },
        create: {
          key: capability.key,
          description: capability.description,
          source: capability.source,
          scope: capability.scope,
          category: capability.category,
          metadata: capability.metadata || Prisma.JsonNull,
          tags: capability.tags || Prisma.JsonNull,
          namespace: capability.namespace,
        },
      });

      if (!capability.assignments.length) {
        logger.warn(
          `⚠️  Capability "${capability.key}" from ${capability.source} has no role assignments.`
        );
        continue;
      }

      for (const assignment of capability.assignments) {
        const role = roleMap.get(assignment.role);
        if (!role) {
          logger.warn(
            `⚠️  Unknown role "${assignment.role}" referenced by capability "${capability.key}" (${capability.source}).`
          );
          continue;
        }

        await client.userRoleCapability.upsert({
          where: {
            roleId_capabilityKey: {
              roleId: role.id,
              capabilityKey: capability.key,
            },
          },
          update: { value: assignment.value },
          create: {
            roleId: role.id,
            capabilityKey: capability.key,
            value: assignment.value,
          },
        });
      }
      seeded += 1;
    }

    const previousState = await readPreviousCapabilityState(statePath);
    if (previousState) {
      const diff = summarizeCapabilityDiff(previousState.capabilities || [], capabilities);
      if (diff.removed.length) {
        diff.removed.forEach((cap) =>
          logger.warn(
            `⚠️  Capability "${cap.key}" (${cap.source || "unknown source"}) no longer declared; consider auditing assigned roles.`
          )
        );
      }
    }

    await writeCapabilityState(statePath, {
      signature,
      generatedAt: new Date().toISOString(),
      capabilities: capabilities.map((cap) => ({ key: cap.key, source: cap.source })),
    });

    logger.log(`✓ Seeded ${seeded} plugin capability definition(s).`);
  } catch (err) {
    if (err?.code === "P2021") {
      logger.warn(
        "⚠️  Skipping plugin metadata/capability seeding – required tables are missing. Run `yarn prepare:db` (or `prisma db push`) first."
      );
      return;
    }
    throw err;
  } finally {
    if (shouldDisconnect) {
      await client.$disconnect();
    }
  }
}

if (import.meta.url === pathToFileURL(process.argv[1] || "").href) {
  seedPlugins().catch((err) => {
    console.error("✗ Failed to seed plugins:", err);
    process.exit(1);
  });
}
