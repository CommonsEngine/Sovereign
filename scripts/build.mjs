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
const pkgPath = path.join(rootDir, "package.json");

const aliasPlugin = {
  name: "alias-dollar",
  setup(buildCtx) {
    buildCtx.onResolve({ filter: /^\$\// }, (args) => ({
      path: path.join(srcDir, args.path.slice(2)),
    }));
  },
};

async function ensureCleanOutDir() {
  await fs.rm(outDir, { recursive: true, force: true });
  await fs.mkdir(outDir, { recursive: true });
}

async function copyStaticAssets() {
  const assets = [
    { from: path.join(rootDir, "public"), to: path.join(outDir, "public") },
    { from: path.join(srcDir, "views"), to: path.join(outDir, "views") },
    { from: pkgPath, to: path.join(outDir, "package.json") },
  ];

  for (const { from, to } of assets) {
    try {
      const stats = await fs.stat(from);
      if (stats.isDirectory()) {
        await cp(from, to, { recursive: true });
      } else {
        await fs.mkdir(path.dirname(to), { recursive: true });
        await fs.copyFile(from, to);
      }
    } catch (err) {
      if (err.code === "ENOENT") continue;
      throw err;
    }
  }
}

async function main() {
  await ensureCleanOutDir();

  const pkg = JSON.parse(await fs.readFile(pkgPath, "utf8"));
  const externals = Object.keys(pkg.dependencies || {});

  await build({
    entryPoints: [path.join(srcDir, "index.mjs")],
    outfile: path.join(outDir, "index.mjs"),
    format: "esm",
    platform: "node",
    bundle: true,
    sourcemap: true,
    logLevel: "info",
    allowOverwrite: true,
    external: [...externals, "@prisma/client", "dotenv/config"],
    plugins: [aliasPlugin],
  });

  await copyStaticAssets();
}

main().catch((err) => {
  console.error(err);
  process.exitCode = 1;
});
