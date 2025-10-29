require("dotenv").config();

const fs = require("fs");
const path = require("path");

// Make sure 'manifest.json' exists,
// and set __rootdir, __plugindir to process.env
const manifestPath = path.resolve(__dirname, "..", "manifest.json");

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

if (!manifest || typeof manifest.__rootdir !== "string" || manifest.__rootdir.length === 0) {
  console.error("✗ manifest.json missing __rootdir entry.");
  process.exit(1);
}

process.env.ROOT_DIR = manifest.__rootdir;
process.env.PLUGINS_DIR = manifest.__pluginsdir;
process.env.DATA_DIR = manifest.__datadir;

// Bootstrap the app
const bootstrapPath =
  process.env.NODE_ENV === "production" ? "./dist/bootstrap.js" : "./src/bootstrap.js";
require(bootstrapPath).bootstrap(manifest);
