/* eslint-disable import/order */
import dotenv from "dotenv";
import { promises as fs } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createRequire } from "module";

const require = createRequire(import.meta.url);
const pkg = require("../package.json");
const plarfotmPkg = require("../platform/package.json");

function formatError(message, options = {}) {
  const { pluginDir, manifestPath } = options;
  const context = [pluginDir, manifestPath].filter(Boolean).join(" ");
  return context ? `${context}: ${message}` : message;
}

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const __rootdir = path.resolve(__dirname, "..");
const __pluginsdir = path.join(__rootdir, "plugins");
const __finalManifestPath = path.join(__rootdir, "manifest.json");

dotenv.config({ path: path.join(__dirname, "..", "platform", ".env") });

// Default Manifest Object
const manifest = {
  platform: {
    version: plarfotmPkg.version,
    title: "Sovereign",
    tagline: "Reclaim your digital freedom.",
    description:
      "Sovereign is a privacy-first, open-source collaboration and productivity suite that empowers individuals and organizations to take control of their digital lives. By providing a decentralized and federated platform, Sovereign enables users to manage their data, communicate securely, and collaborate effectively while prioritizing privacy and self-determination.",
    keywords: pkg.keywords,
  },
  core: {
    version: pkg.version,
  },
  cli: {
    version: pkg.cliVersion,
  },
  plugins: {},
  enabledPlugins: [], // [@<org>/<ns>]
  __rootdir,
  __pluginsdir,
  __assets: [],
  __views: [],
  __partials: [],
  __routes: {},
};

const buildManifest = async () => {
  const plugins = {};

  // Read plugins directory to identify pluginCandidates
  let pluginCandidates;
  try {
    pluginCandidates = await fs.readdir(__pluginsdir, { withFileTypes: true });
  } catch (err) {
    if (err.code === "ENOENT") {
      console?.warn?.(`Extension host: plugins directory "${__pluginsdir}" does not exist.`);
      return {
        plugins: {},
        enabledPlugins: [],
        pluginsPublicAssetsDirs: [],
      };
    }
    throw err;
  }

  for (const candidate of pluginCandidates) {
    if (!candidate.isDirectory?.()) continue;
    const namespace = candidate.name;
    const plugingRoot = path.join(__pluginsdir, namespace);

    const pluginManifestPath = path.join(plugingRoot, "plugin.json");

    let pluginManifestSource;
    try {
      pluginManifestSource = await fs.readFile(pluginManifestPath, "utf8");
    } catch (err) {
      if (err.code === "ENOENT") {
        console?.warn?.(
          formatError(`missing plugin.json file`, {
            manifestPath: pluginManifestPath,
            pluginDir: plugingRoot,
          })
        );
        continue;
      }
      throw err;
    }

    let pluginManifest;
    try {
      pluginManifest = JSON.parse(pluginManifestSource);
    } catch (err) {
      console?.error?.(
        formatError(`invalid JSON: ${err.message}`, {
          manifestPath: pluginManifestPath,
          pluginDir: plugingRoot,
        })
      );
      continue;
    }

    // TODO: Validate the schema
    // TODO: Normalize pluginManifest
    // TODO: Intergrity Check

    const isEnabledPlugin =
      (process.env.NODE_ENV === "production" || pluginManifest.devOnly) && !pluginManifest.draft;

    if (isEnabledPlugin) {
      manifest.enabledPlugins.push(`${namespace}@${pluginManifest.version}`);

      if (!pluginManifest?.type || !["spa", "custom"].includes(pluginManifest.type)) {
        console?.warn?.(
          formatError(`unknown or missing plugin type: ${pluginManifest?.type}`, {
            manifestPath: pluginManifestPath,
            pluginDir: plugingRoot,
          })
        );
      }
      if (!pluginManifest?.version) {
        console?.warn?.(
          formatError(`missing version in plugin.json`, {
            manifestPath: pluginManifestPath,
            pluginDir: plugingRoot,
          })
        );
      }

      const publicDir = path.join(plugingRoot, "public");
      const distDir = path.join(plugingRoot, "dist");
      const assetsDir = path.join(distDir, "assets");

      let entry = path.join(plugingRoot, "dist", "index.js");
      // TODO: Consider use entry from /dest/ once build process implemented for custom plugins
      if (pluginManifest.type === "custom") {
        entry = path.join(plugingRoot, "index.js");
      }

      try {
        await fs.access(publicDir);
        manifest.__assets.push({ base: "/", dir: publicDir });
      } catch {
        console?.warn(`error access: ${publicDir}`);
      }

      if (pluginManifest.type === "spa") {
        try {
          await fs.access(distDir);
          manifest.__assets.push({ base: `/plugins/${namespace}/`, dir: distDir });
        } catch {
          console?.warn(`error access: ${distDir}`);
        }
        try {
          await fs.access(assetsDir);
          manifest.__assets.push({ base: `/`, dir: assetsDir });
        } catch {
          console?.warn(`error access: ${assetsDir}`);
        }
      }

      if (pluginManifest.type === "custom") {
        //__views
        const viewsDir = path.join(plugingRoot, "views");
        try {
          await fs.access(viewsDir);
          manifest.__views.push({ base: namespace, dir: viewsDir });
        } catch {
          console?.warn(`error access: ${viewsDir}`);
        }

        // __partials
        const __partialsdir = path.join(plugingRoot, "views", "_partials");
        try {
          await fs.access(__partialsdir);
          manifest.__partials.push({ base: namespace, dir: __partialsdir });
        } catch {
          console?.warn(`error access: ${__partialsdir}`);
        }

        // __routes
        manifest.__routes[namespace] = {};

        const apiRoutesPath = path.join(plugingRoot, "routes", "api", "index.js");
        try {
          await fs.access(apiRoutesPath);
          manifest.__routes[namespace]["api"] = {
            base: `/plugins/${namespace}`,
            path: apiRoutesPath,
          };
        } catch {
          console?.warn(`error access: ${apiRoutesPath}`);
        }

        const webRoutesPath = path.join(plugingRoot, "routes", "web", "index.js");
        try {
          await fs.access(webRoutesPath);
          manifest.__routes[namespace]["web"] = {
            base: `/${namespace}`,
            path: webRoutesPath,
          };
        } catch {
          console?.warn(`error access: ${webRoutesPath}`);
        }
      }

      plugins[namespace] = {
        namespace,
        entry,
        ...pluginManifest,
      };
    }
  }

  const outputManifest = {
    ...manifest,
    plugins: {
      ...manifest.plugins,
      ...plugins,
    },
  };

  await fs.writeFile(__finalManifestPath, JSON.stringify(outputManifest, null, 2));
  console?.log?.(`Manifest written: ${__finalManifestPath}`);
};

await buildManifest();
