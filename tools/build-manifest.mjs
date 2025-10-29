/* eslint-disable import/order */
import Ajv from "ajv";
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

// TODO: Trim some unnecessary fields.

// Default Manifest Object
const manifest = {
  env: process.env.NODE_ENV,
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
  allowedPluginTypes: [],
  __rootdir,
  __pluginsdir,
  __assets: [],
  __views: [],
  __partials: [],
  __routes: {},
  __spaentrypoints: [],
};

const pluginManifestSchema = {
  $id: "PluginManifest",
  type: "object",
  required: ["id", "name", "version", "type", "sovereign"],
  additionalProperties: true,
  properties: {
    id: { type: "string", minLength: 1 },
    name: { type: "string", minLength: 1 },
    description: { type: "string" },
    version: { type: "string", minLength: 1 },
    type: { type: "string", enum: ["custom", "spa"] },
    devOnly: { type: "boolean" },
    draft: { type: "boolean" },
    author: { type: "string" },
    license: { type: "string" },
    sovereign: {
      type: "object",
      required: ["schemaVersion", "engine", "entryPoints"],
      additionalProperties: true,
      properties: {
        schemaVersion: { type: "integer", minimum: 0 },
        engine: { type: "string", minLength: 1 },
        entryPoints: {
          type: "array",
          minItems: 1,
          items: { type: "string", minLength: 1 },
        },
      },
    },
    platformCapabilities: {
      type: "object",
      additionalProperties: { type: "boolean" },
    },
    userCapabilities: {
      type: "array",
      items: {
        type: "object",
        required: ["key", "description", "roles"],
        additionalProperties: true,
        properties: {
          key: { type: "string", minLength: 1 },
          description: { type: "string" },
          roles: {
            type: "array",
            minItems: 1,
            items: { type: "string", minLength: 1 },
          },
        },
      },
    },
  },
};

const ajv = new Ajv({
  allErrors: true,
  strict: false,
});

const validatePluginManifest = ajv.compile(pluginManifestSchema);

const exists = async (p) => {
  try {
    await fs.access(p);
    return true;
  } catch {
    return false;
  }
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
        formatError(`✗ invalid JSON: ${err.message}`, {
          manifestPath: pluginManifestPath,
          pluginDir: plugingRoot,
        })
      );
      continue;
    }

    if (!validatePluginManifest(pluginManifest)) {
      const schemaErrors =
        validatePluginManifest.errors
          ?.map((error) => `${error.instancePath || error.schemaPath}: ${error.message}`)
          .join("; ") || "unknown validation error";
      console?.error?.(
        formatError(`✗ invalid manifest schema: ${schemaErrors}`, {
          manifestPath: pluginManifestPath,
          pluginDir: plugingRoot,
        })
      );
      continue;
    }

    const isEnabledPlugin =
      process.env.NODE_ENV !== "production"
        ? !pluginManifest.draft
        : !pluginManifest.devOnly && !pluginManifest.draft;

    if (isEnabledPlugin) {
      if (!manifest.allowedPluginTypes.includes(pluginManifest.type)) {
        manifest.allowedPluginTypes.push(pluginManifest.type);
      }

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
      // const assetsDir = path.join(distDir, "assets"); // removed as per instructions

      let entry = path.join(plugingRoot, "dist", "index.js");
      // TODO: Consider use entry from /dest/ once build process implemented for custom plugins
      if (pluginManifest.type === "custom") {
        entry = path.join(plugingRoot, "index.js");
      }

      // publicDir quiet check
      if (await exists(publicDir)) {
        manifest.__assets.push({ base: "/", dir: publicDir });
      } else if (process.env.DEBUG === "true") {
        console?.debug?.(`no public dir: ${publicDir}`);
      }

      if (pluginManifest.type === "spa") {
        if (await exists(distDir)) {
          manifest.__assets.push({ base: `/plugins/${namespace}/`, dir: distDir });
        } else if (process.env.DEBUG === "true") {
          console?.debug?.(`no dist dir: ${distDir}`);
        }

        if (await exists(entry)) {
          manifest.__spaentrypoints.push({ ns: namespace, entry });
        } else if (process.env.DEBUG === "true") {
          console?.debug?.(`no SPA entry: ${entry}`);
        }
      }

      if (pluginManifest.type === "custom") {
        //__views
        const viewsDir = path.join(plugingRoot, "views");
        if (await exists(viewsDir)) {
          manifest.__views.push({ base: namespace, dir: viewsDir });
        } else if (process.env.DEBUG === "true") {
          console?.debug?.(`no views dir: ${viewsDir}`);
        }

        // __partials
        const __partialsdir = path.join(plugingRoot, "views", "_partials");
        if (await exists(__partialsdir)) {
          manifest.__partials.push({ base: namespace, dir: __partialsdir });
        } else if (process.env.DEBUG === "true") {
          console?.debug?.(`no partials dir: ${__partialsdir}`);
        }

        // __routes
        const resolveRouteIndex = async (dir) => {
          const candJs = path.join(dir, "index.js");
          if (await exists(candJs)) return candJs;
          const candMjs = path.join(dir, "index.mjs");
          if (await exists(candMjs)) return candMjs;
          return null;
        };
        manifest.__routes[namespace] = {};

        const apiRoutesPath = await resolveRouteIndex(path.join(plugingRoot, "routes", "api"));
        if (apiRoutesPath) {
          manifest.__routes[namespace]["api"] = {
            base: `/plugins/${namespace}`,
            path: apiRoutesPath,
          };
        } else if (process.env.DEBUG === "true") {
          console?.debug?.(`no api routes: ${path.join(plugingRoot, "routes", "api")}`);
        }

        const webRoutesPath = await resolveRouteIndex(path.join(plugingRoot, "routes", "web"));
        if (webRoutesPath) {
          manifest.__routes[namespace]["web"] = {
            base: `/${namespace}`,
            path: webRoutesPath,
          };
        } else if (process.env.DEBUG === "true") {
          console?.debug?.(`no web routes: ${path.join(plugingRoot, "routes", "web")}`);
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
    allowedPluginTypes: [...new Set(manifest.allowedPluginTypes || [])],
    plugins: {
      ...manifest.plugins,
      ...plugins,
    },
  };

  await fs.writeFile(__finalManifestPath, JSON.stringify(outputManifest, null, 2) + "\n");
  console?.log?.(`➜ Enabled plugins: ${manifest.enabledPlugins.join(", ") || "(none)"}`);
  console?.log?.(`✓ Manifest written: ${__finalManifestPath}`);
};

await buildManifest();
