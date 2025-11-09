require("dotenv").config();

const fs = require("node:fs");
const path = require("node:path");

const manifestPath = path.resolve(__dirname, "..", "manifest.json");

// Make sure 'manifest.json' exists,
if (!fs.existsSync(manifestPath)) {
  console.error("✗ Missing manifest.json at project root.");
  process.exit(1);
}

let manifest;
try {
  manifest = JSON.parse(fs.readFileSync(manifestPath, "utf8"));
} catch (error) {
  console.error("✗ Failed to load manifest.json:", error);
  process.exit(1);
}

const requiredKeys = ["__rootdir", "__pluginsdir", "__datadir"];
for (const k of requiredKeys) {
  if (!manifest || typeof manifest[k] !== "string" || manifest[k].length === 0) {
    console.error(`✗ manifest.json missing ${k} entry.`);
    process.exit(1);
  }
}

process.env.ROOT_DIR = manifest.__rootdir;
process.env.PLUGINS_DIR = manifest.__pluginsdir;
process.env.DATA_DIR = manifest.__datadir;

// Use dist in production if you build there
const isProd = process.env.NODE_ENV === "production";
const bootstrapPath = isProd ? "./dist/bootstrap.js" : "./src/bootstrap.js";

(async () => {
  try {
    const mod = await import(bootstrapPath);
    const bootstrap = mod.bootstrap ?? mod.default ?? mod;
    await bootstrap(manifest);
  } catch (err) {
    console.error("✗ Failed to start:", err?.stack || err);
    process.exit(1);
  }
})();
