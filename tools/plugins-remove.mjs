import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

import { execa } from "execa";
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();
const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const pluginsDir = path.join(repoRoot, "plugins");
const archiveRoot = path.join(repoRoot, ".sv-plugins-archive");

function parseArgs(argv = []) {
  const flags = new Set();
  const positional = [];

  for (const arg of argv) {
    if (arg.startsWith("--")) {
      flags.add(arg.replace(/^--/, "").toLowerCase());
    } else {
      positional.push(arg);
    }
  }

  return {
    namespace: positional[0] || null,
    keepFiles: flags.has("keep-files") || flags.has("keep"),
    dryRun: flags.has("dry-run") || flags.has("dry"),
  };
}

async function pathExists(target) {
  try {
    await fs.access(target);
    return true;
  } catch {
    return false;
  }
}

async function directoryHasContent(dir) {
  try {
    const entries = await fs.readdir(dir);
    return entries.length > 0;
  } catch (err) {
    if (err?.code === "ENOENT") return false;
    throw err;
  }
}

function timestampSlug() {
  return new Date().toISOString().replace(/[:.]/g, "-");
}

async function removePlugin({ namespace, keepFiles = false, dryRun = false }) {
  const pluginDir = path.join(pluginsDir, namespace);
  const manifestPath = path.join(pluginDir, "plugin.json");

  if (!(await pathExists(manifestPath))) {
    throw new Error(`Plugin "${namespace}" not found at ${pluginDir}.`);
  }

  const manifestRaw = await fs.readFile(manifestPath, "utf8");
  const manifest = JSON.parse(manifestRaw);
  const pluginId = manifest.id || namespace;

  const manifestEnabled = manifest.enabled !== false;
  const isDisabled = manifestEnabled === false && manifest.devOnly === true;
  if (!isDisabled) {
    throw new Error(
      `${pluginId} is currently enabled. Disable it first via "sv plugins disable ${namespace}".`
    );
  }

  const migrationDirs = [
    path.join(pluginDir, "migrations"),
    path.join(pluginDir, "prisma", "migrations"),
  ];
  for (const dir of migrationDirs) {
    if (await directoryHasContent(dir)) {
      throw new Error(
        `${pluginId} has unapplied or historical migrations under ${dir}. Remove or archive them first.`
      );
    }
  }

  if (dryRun) {
    console.log(
      `[dry-run] Would remove plugin ${pluginId} from ${pluginDir} (keepFiles=${
        keepFiles ? "true" : "false"
      }).`
    );
    console.log("[dry-run] Would rebuild manifest via yarn build:manifest.");
    console.log('[dry-run] Would reload pm2 process "sovereign" if available.');
    return;
  }

  let removedFromDb = false;
  try {
    await prisma.plugin.delete({ where: { pluginId } });
    removedFromDb = true;
  } catch (err) {
    if (err?.code !== "P2025") {
      throw err;
    }
  }

  if (keepFiles) {
    await fs.mkdir(archiveRoot, { recursive: true });
    const target = path.join(archiveRoot, `${namespace}-${timestampSlug()}`);
    await fs.rename(pluginDir, target);
    console.log(`Archived plugin files to ${target}.`);
  } else {
    await fs.rm(pluginDir, { recursive: true, force: true });
    console.log(`Removed plugin directory ${pluginDir}.`);
  }

  console.log("Rebuilding manifest via yarn build:manifest…");
  await execa("yarn", ["build:manifest"], { cwd: repoRoot, stdio: "inherit" });

  try {
    await execa("pm2", ["reload", "sovereign"], { stdio: "inherit" });
  } catch (error) {
    if (error.code === "ENOENT") {
      console.warn("⚠️  pm2 not found; skipping reload.");
    } else {
      throw error;
    }
  }

  const dbNote = removedFromDb ? " and removed database entry" : "";
  console.log(`✓ Removed plugin ${pluginId}${dbNote}.`);
}

async function main() {
  const { namespace, keepFiles, dryRun } = parseArgs(process.argv.slice(2));
  if (!namespace) {
    console.error(
      "Usage: node tools/plugins-remove.mjs <namespace> [--keep-files] [--dry-run]\n" +
        "Example: node tools/plugins-remove.mjs blog"
    );
    process.exit(1);
  }

  await removePlugin({ namespace, keepFiles, dryRun });
}

async function run() {
  try {
    await main();
  } catch (error) {
    console.error("✗ Plugin removal failed:", error?.message || error);
    process.exitCode = 1;
  } finally {
    await prisma.$disconnect();
  }
}

if (import.meta.url === pathToFileURL(process.argv[1] || "").href) {
  run();
}
