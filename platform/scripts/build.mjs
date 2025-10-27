import { promises as fs } from "node:fs";
// eslint-disable-next-line n/no-unsupported-features/node-builtins
import { cp } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { build } from "esbuild";

// TODO: Optimize the build script

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.resolve(__dirname, "..");
const srcDir = path.join(rootDir, "src");
const outDir = path.join(rootDir, "dist");
const pkgPath = path.join(rootDir, "package.json");
const viewsDir = path.join(srcDir, "views");
const distPkgPath = path.join(outDir, "package.json");

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
    {
      from: path.join(srcDir, "public"),
      to: path.join(outDir, "public"),
    },
    {
      from: path.join(srcDir, "views"),
      to: path.join(outDir, "views"),
    },
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

async function writeDistPackageJson() {
  // Ensure Node treats all files under dist/ as ESM to avoid MODULE_TYPELESS_PACKAGE_JSON warnings.
  const minimal = { type: "module" };
  await fs.mkdir(outDir, { recursive: true });
  await fs.writeFile(distPkgPath, JSON.stringify(minimal, null, 2), "utf8");
}

async function collectReactViewEntries() {
  const entries = [];
  const allowedExts = new Set([".jsx", ".tsx", ".js", ".ts"]);

  async function walk(dir) {
    const dirents = await fs.readdir(dir, { withFileTypes: true });
    for (const dirent of dirents) {
      const fullPath = path.join(dir, dirent.name);
      if (dirent.isDirectory()) {
        await walk(fullPath);
        continue;
      }

      const ext = path.extname(dirent.name);
      if (!allowedExts.has(ext)) continue;
      if (/\.client\.(jsx|tsx|js|ts)$/.test(dirent.name)) continue;
      entries.push(fullPath);
    }
  }

  try {
    await walk(viewsDir);
  } catch (err) {
    if (err.code !== "ENOENT") throw err;
  }

  return entries;
}

async function main() {
  await ensureCleanOutDir();

  const pkg = JSON.parse(await fs.readFile(pkgPath, "utf8"));
  const externals = new Set([
    ...Object.keys(pkg.dependencies || {}),
    "@prisma/client",
    "dotenv/config",
    "vite",
    "lightningcss",
    "fsevents",
  ]);
  const externalDeps = Array.from(externals);

  await build({
    entryPoints: [path.join(srcDir, "bootstrap.js")],
    outfile: path.join(outDir, "bootstrap.js"),
    format: "esm",
    platform: "node",
    bundle: true,
    sourcemap: true,
    logLevel: "info",
    allowOverwrite: true,
    external: externalDeps,
    plugins: [aliasPlugin],
  });

  const reactEntries = await collectReactViewEntries();

  if (reactEntries.length > 0) {
    await build({
      entryPoints: reactEntries,
      outdir: path.join(outDir, "server"),
      outbase: rootDir,
      format: "esm",
      platform: "node",
      bundle: false,
      sourcemap: true,
      logLevel: "info",
      allowOverwrite: true,
      plugins: [aliasPlugin],
      loader: {
        ".jsx": "jsx",
        ".tsx": "tsx",
      },
      target: "node20",
    });
  }

  await copyStaticAssets();
  await writeDistPackageJson();
}

main().catch((err) => {
  console.error(err);
  process.exitCode = 1;
});
