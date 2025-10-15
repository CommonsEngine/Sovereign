import { build } from "esbuild";
import { promises as fs } from "node:fs";
import { cp } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.resolve(__dirname, "..");
const srcDir = path.join(rootDir, "src");
const outDir = path.join(rootDir, "dist");

const aliasPlugin = {
  name: "alias-dollar",
  setup(buildCtx) {
    buildCtx.onResolve({ filter: /^\$\// }, (args) => {
      const absolutePath = path.join(srcDir, args.path.slice(2));
      const relativeToImporter = path.relative(args.resolveDir, absolutePath);

      const normalized = relativeToImporter.startsWith(".")
        ? relativeToImporter
        : `./${relativeToImporter}`;

      return {
        path: normalized.split(path.sep).join("/"),
      };
    });
  },
};

async function collectEntryPoints(dir) {
  const dirents = await fs.readdir(dir, { withFileTypes: true });
  const entries = [];

  for (const dirent of dirents) {
    if (dirent.name.startsWith(".")) continue;
    const fullPath = path.join(dir, dirent.name);
    if (dirent.isDirectory()) {
      entries.push(...(await collectEntryPoints(fullPath)));
    } else if (dirent.isFile() && dirent.name.endsWith(".mjs")) {
      entries.push(fullPath);
    }
  }

  return entries;
}

async function ensureCleanOutDir() {
  await fs.rm(outDir, { recursive: true, force: true });
  await fs.mkdir(outDir, { recursive: true });
}

async function copyStaticAssets() {
  const assets = [
    { from: path.join(rootDir, "public"), to: path.join(outDir, "public") },
    { from: path.join(srcDir, "views"), to: path.join(outDir, "views") },
  ];

  for (const { from, to } of assets) {
    try {
      await cp(from, to, { recursive: true });
    } catch (err) {
      if (err.code === "ENOENT") continue;
      throw err;
    }
  }
}

async function main() {
  await ensureCleanOutDir();

  const entryPoints = await collectEntryPoints(srcDir);

  await build({
    entryPoints,
    outdir: outDir,
    outbase: srcDir,
    format: "esm",
    platform: "node",
    bundle: false,
    sourcemap: true,
    logLevel: "info",
    allowOverwrite: true,
    plugins: [aliasPlugin],
  });

  await copyStaticAssets();
}

main().catch((err) => {
  console.error(err);
  process.exitCode = 1;
});
