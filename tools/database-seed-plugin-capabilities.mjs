/* eslint-disable import/order */
import { PrismaClient } from "@prisma/client";
import fg from "fast-glob";
import { promises as fs } from "node:fs";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const CAPABILITY_DEFAULT_VALUE = "allow";

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, "..");

function parseRoleAssignment(entry) {
  if (!entry) return null;
  if (typeof entry === "string") {
    return { role: entry.trim(), value: CAPABILITY_DEFAULT_VALUE };
  }
  if (typeof entry === "object") {
    const role = String(entry.role || entry.key || "").trim();
    if (!role) return null;
    const value =
      typeof entry.value === "string" && entry.value ? entry.value : CAPABILITY_DEFAULT_VALUE;
    return { role, value };
  }
  return null;
}

function resolveUserCapabilityList(manifest, manifestPath) {
  const nested = manifest?.sovereign?.userCapabilities;
  if (Array.isArray(nested) && nested.length > 0) {
    return nested;
  }

  const legacy = manifest?.userCapabilities;
  if (Array.isArray(legacy) && legacy.length > 0) {
    console.warn(
      `⚠️  ${manifestPath}: top-level userCapabilities is deprecated; move it to sovereign.userCapabilities.`
    );
    return legacy;
  }

  return [];
}

async function collectPluginCapabilities() {
  const matches = await fg("plugins/*/plugin.json", { cwd: root, absolute: true });
  const capabilities = [];

  for (const manifestPath of matches) {
    let manifest;
    try {
      const raw = await fs.readFile(manifestPath, "utf8");
      manifest = JSON.parse(raw);
    } catch (err) {
      console.warn(`⚠️  Failed to read ${manifestPath}: ${err?.message || err}`);
      continue;
    }

    const pluginId = manifest?.id || path.basename(path.dirname(manifestPath));
    const capabilityList = resolveUserCapabilityList(manifest, manifestPath);

    if (!Array.isArray(capabilityList) || capabilityList.length === 0) continue;

    for (const cap of capabilityList) {
      if (!cap || typeof cap !== "object") continue;
      const key = typeof cap.key === "string" ? cap.key.trim() : "";
      if (!key) continue;

      const description =
        typeof cap.description === "string" && cap.description.trim().length
          ? cap.description.trim()
          : `Capability declared by plugin ${pluginId}`;

      const assignments = Array.isArray(cap.roles)
        ? cap.roles
            .map((role) => parseRoleAssignment(role))
            .filter((assignment) => assignment && assignment.role)
        : [];

      capabilities.push({
        key,
        description,
        assignments,
        source: pluginId,
      });
    }
  }

  return capabilities;
}

export async function seedPluginCapabilities({ prisma, logger = console } = {}) {
  const client = prisma || new PrismaClient();
  const shouldDisconnect = !prisma;

  try {
    const capabilities = await collectPluginCapabilities();
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
        update: { description: capability.description },
        create: {
          key: capability.key,
          description: capability.description,
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

    logger.log(`✓ Seeded ${seeded} plugin capability definition(s).`);
  } finally {
    if (shouldDisconnect) {
      await client.$disconnect();
    }
  }
}

if (import.meta.url === pathToFileURL(process.argv[1] || "").href) {
  seedPluginCapabilities().catch((err) => {
    console.error("✗ Failed to seed plugin capabilities:", err);
    process.exit(1);
  });
}
