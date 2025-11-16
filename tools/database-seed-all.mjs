/* eslint-disable import/order */
import { PrismaClient } from "@prisma/client";
import fg from "fast-glob";
import { execa } from "execa";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { seedPlugins as seedPluginsBase } from "./database-seed-plugins.mjs";

const here = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(here, "..");
const prisma = new PrismaClient();

async function runPlatformSeed() {
  console.log("🌱 Running core platform seed...");
  await execa("yarn", ["workspace", "@sovereign/platform", "prisma:seed"], {
    cwd: repoRoot,
    stdio: "inherit",
  });
}

async function runPluginSeeds() {
  const matches = await fg("plugins/*/prisma/seeds.mjs", {
    cwd: repoRoot,
    absolute: true,
  });

  if (!matches.length) {
    console.log("ℹ️  No plugin seed scripts found.");
    return;
  }

  for (const file of matches) {
    try {
      const mod = await import(file);
      if (typeof mod.seed === "function") {
        console.log("🌱 Seeding plugin:", file);
        await mod.seed({ prisma });
      } else {
        console.log(`ℹ️  ${file} does not export a seed() function. Skipping.`);
      }
    } catch (err) {
      console.error(`✗ Plugin seed failed (${file}):`, err);
      throw err;
    }
  }
  console.log("✓ Plugin seeds completed");
}

async function main() {
  await runPlatformSeed();
  await seedPluginsBase({ prisma });
  await runPluginSeeds();
}

try {
  await main();
  console.log("✓ All database seeds completed");
} catch (err) {
  console.error("✗ Database seeding failed:", err);
  process.exit(1);
} finally {
  await prisma.$disconnect();
}
