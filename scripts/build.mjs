import { promises as fs } from "node:fs";
// eslint-disable-next-line n/no-unsupported-features/node-builtins
import { cp } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { build } from "esbuild";

// TODO: Fix, adjust build script

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.resolve(__dirname, "..");
const srcDir = path.join(rootDir, "src");
const outDir = path.join(rootDir, "dist");
const pkgPath = path.join(rootDir, "package.json");
const viewsDir = path.join(srcDir, "views");
const pluginsDir = path.join(srcDir, "plugins");
const distPluginsDir = path.join(outDir, "plugins");
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

async function collectPluginServerEntries() {
  const entries = [];
  const allowedExts = new Set([".mjs", ".js", ".ts", ".tsx", ".jsx"]);
  const skipDirs = new Set([
    "public",
    "views",
    "prisma",
    "ui",
    "node_modules",
    "dist",
  ]);

  async function walk(dir) {
    let dirents;
    try {
      dirents = await fs.readdir(dir, { withFileTypes: true });
    } catch (err) {
      if (err.code === "ENOENT") return; // plugins folder may not exist
      throw err;
    }
    for (const d of dirents) {
      const full = path.join(dir, d.name);
      if (d.isDirectory()) {
        if (skipDirs.has(d.name)) continue;
        await walk(full);
      } else {
        const ext = path.extname(d.name);
        if (!allowedExts.has(ext)) continue;
        entries.push(full);
      }
    }
  }

  await walk(pluginsDir);
  return entries;
}

async function copyPluginAssets() {
  // Copy plugin views/ and public/ to dist/plugins/<namespace>/...
  let namespaces = [];
  try {
    namespaces = (await fs.readdir(pluginsDir, { withFileTypes: true }))
      .filter((d) => d.isDirectory())
      .map((d) => d.name);
  } catch (err) {
    if (err.code === "ENOENT") return; // no plugins directory
    throw err;
  }

  for (const ns of namespaces) {
    const srcViews = path.join(pluginsDir, ns, "views");
    const srcPublic = path.join(pluginsDir, ns, "public");
    const dstViews = path.join(distPluginsDir, ns, "views");
    const dstPublic = path.join(distPluginsDir, ns, "public");

    try {
      const statV = await fs.stat(srcViews);
      if (statV.isDirectory()) {
        await fs.mkdir(dstViews, { recursive: true });
        await cp(srcViews, dstViews, { recursive: true });
      }
    } catch (e) {
      if (e.code !== "ENOENT") throw e;
    }

    try {
      const statP = await fs.stat(srcPublic);
      if (statP.isDirectory()) {
        await fs.mkdir(dstPublic, { recursive: true });
        await cp(srcPublic, dstPublic, { recursive: true });
      }
    } catch (e) {
      if (e.code !== "ENOENT") throw e;
    }
  }
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
    entryPoints: [path.join(srcDir, "bootstrap.mjs")],
    outfile: path.join(outDir, "bootstrap.mjs"),
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

  // Build plugin server files (routes, index, helpers) to dist/plugins preserving structure
  const pluginEntries = await collectPluginServerEntries();
  if (pluginEntries.length > 0) {
    await build({
      entryPoints: pluginEntries,
      outdir: outDir, // paired with outbase to mirror src/ structure under dist/
      outbase: srcDir,
      format: "esm",
      platform: "node",
      bundle: false,
      sourcemap: true,
      logLevel: "info",
      allowOverwrite: true,
      plugins: [aliasPlugin],
      loader: { ".jsx": "jsx", ".tsx": "tsx" },
      target: "node20",
    });
  }

  await copyStaticAssets();
  await copyPluginAssets();
  await writeDistPackageJson();
}

main().catch((err) => {
  console.error(err);
  process.exitCode = 1;
});
