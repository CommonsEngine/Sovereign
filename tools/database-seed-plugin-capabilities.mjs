/* eslint-disable import/order */
import { PrismaClient, Prisma } from "@prisma/client";
import path from "node:path";
import { pathToFileURL } from "node:url";

import {
  collectPluginCapabilities,
  repoRoot,
  summarizeCapabilityDiff,
  readPreviousCapabilityState,
  writeCapabilityState,
} from "./lib/plugin-capabilities.mjs";

const statePath = path.join(repoRoot, "data", "plugin-capabilities.lock.json");

export async function seedPluginCapabilities({ prisma, logger = console } = {}) {
  const client = prisma || new PrismaClient();
  const shouldDisconnect = !prisma;

  try {
    const { capabilities, diagnostics, signature } = await collectPluginCapabilities();
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
