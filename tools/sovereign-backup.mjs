/**
 * Minimal Sovereign backup
 * - Picks: /data/* and /platform/.env (relative to repo root)
 * - Writes: /.backups/sv_<YYYYMMDD-HHMMSS>.tar.gz
 *
 * Usage:
 *   node tools/backup.mjs
 *   # or (with shebang)
 *   ./tools/backup.mjs
 */

import { promises as fs } from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { spawn } from "child_process";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROOT = path.resolve(__dirname, ".."); // repo root (tools/..)

const DATA_DIR = path.join(ROOT, "data");
const ENV_FILE = path.join(ROOT, "platform", ".env");
const MANIFEST_FILE = path.join(ROOT, "manifest.json");
const SCHEMA_FILE = path.join(ROOT, "platform", "prisma", "schema.prisma");
const BACKUP_DIR = path.join(ROOT, ".backups");

function tsNow() {
  const d = new Date();
  const pad = (n) => String(n).padStart(2, "0");
  const y = d.getFullYear();
  const m = pad(d.getMonth() + 1);
  const day = pad(d.getDate());
  const h = pad(d.getHours());
  const min = pad(d.getMinutes());
  const s = pad(d.getSeconds());
  return `${y}${m}${day}-${h}${min}${s}`;
}

async function exists(p, type = "any") {
  try {
    const st = await fs.stat(p);
    if (type === "dir") return st.isDirectory();
    if (type === "file") return st.isFile();
    return true;
  } catch {
    return false;
  }
}

function log(msg) {
  console.log(`[backup] ${msg}`);
}

async function ensureDir(p) {
  await fs.mkdir(p, { recursive: true });
}

function run(cmd, args, opts = {}) {
  return new Promise((resolve, reject) => {
    const child = spawn(cmd, args, { stdio: "inherit", ...opts });
    child.on("close", (code) => {
      if (code === 0) return resolve();
      reject(new Error(`${cmd} ${args.join(" ")} exited with ${code}`));
    });
  });
}

async function main() {
  await ensureDir(BACKUP_DIR);

  // Make sure there's something to back up
  const hasData = await exists(DATA_DIR, "dir");
  const hasEnv = await exists(ENV_FILE, "file");
  const hasManifest = await exists(MANIFEST_FILE, "file");
  const hasSchema = await exists(SCHEMA_FILE, "file");

  if (!hasData && !hasEnv && !hasManifest && !hasSchema) {
    throw new Error(
      `Nothing to back up. Expected at least one of:\n  - ${DATA_DIR}\n  - ${ENV_FILE}\n  - ${MANIFEST_FILE}`
    );
  }

  const stamp = tsNow();
  const outFile = path.join(BACKUP_DIR, `sv_${stamp}.tar.gz`);

  // Build item list relative to ROOT and use -C ROOT so paths in archive are tidy
  const items = [];
  if (hasData) items.push("data");
  if (hasEnv) items.push("platform/.env");
  if (hasManifest) items.push("manifest.json");
  if (hasSchema) items.push("platform/prisma/schema.prisma");

  log(`Creating archive: ${outFile}`);
  log(
    `Including: ${items.map((i) => (i === "manifest.json" ? "/manifest.json" : i === "platform/.env" ? "/platform/.env" : "/" + i)).join(", ")}`
  );

  // tar -czf <out> -C <ROOT> <items...>
  await run("tar", ["-czf", outFile, "-C", ROOT, ...items]);

  log("Done.");
  console.log(outFile);
}

main().catch((e) => {
  console.error(e.message || e);
  process.exit(1);
});
