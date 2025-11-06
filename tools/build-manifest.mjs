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
const __datadir = path.join(__rootdir, "data");
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
  projects: [],
  modules: [],
  enabledPlugins: [], // [@<org>/<ns>]
  allowedPluginTypes: [],
  __rootdir,
  __pluginsdir,
  __datadir,
  __assets: [],
  __views: [],
  __partials: [],
  __routes: {},
  __spaentrypoints: [],
};

const pluginManifestSchema = {
  $id: "PluginManifest",
  type: "object",
  required: ["id", "name", "version", "type", "sovereign", "devOnly", "author", "license"],
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
      required: ["schemaVersion"],
      additionalProperties: true,
      properties: {
        schemaVersion: { type: "integer", minimum: 1 },
        allowMultipleInstances: { type: "boolean" },
        compat: {
          type: "object",
          additionalProperties: false,
          properties: {
            platform: { type: "string" },
            node: { type: "string" },
          },
        },
        routes: {
          type: "object",
          additionalProperties: false,
          properties: {
            web: { type: "string", minLength: 1 },
            api: { type: "string", minLength: 1 },
          },
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
    const plugingDirName = candidate.name;
    const plugingRoot = path.join(__pluginsdir, plugingDirName);

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

      // TODO: split `id` field by "/", and take id[1] as one of the fallback namespace value
      const manifestNamespace = pluginManifest.namespace || plugingDirName;

      manifest.enabledPlugins.push(`${manifestNamespace}@${pluginManifest.version}`);

      const publicDir = path.join(plugingRoot, "public");
      const distDir = path.join(plugingRoot, "dist");

      let entry = path.join(plugingRoot, "dist", "index.js");
      // TODO: Consider use entry from /dest/ once build process implemented for custom plugins
      if (pluginManifest.type === "custom") {
        entry = path.join(plugingRoot, "index.js");
      }

      // publicDir quiet check
      // TODO: Coinsider scoped the assets URLs
      if (await exists(publicDir)) {
        manifest.__assets.push({ base: "/", dir: publicDir });
      } else if (process.env.DEBUG === "true") {
        console?.debug?.(`no public dir: ${publicDir}`);
      }

      if (pluginManifest.type === "spa") {
        if (await exists(distDir)) {
          manifest.__assets.push({ base: `/plugins/${manifestNamespace}/`, dir: distDir });
        } else if (process.env.DEBUG === "true") {
          console?.debug?.(`no dist dir: ${distDir}`);
        }

        if (await exists(entry)) {
          manifest.__spaentrypoints.push({ ns: manifestNamespace, entry });
        } else if (process.env.DEBUG === "true") {
          console?.debug?.(`no SPA entry: ${entry}`);
        }
      }

      if (pluginManifest.type === "custom") {
        //__views
        const viewsDir = path.join(plugingRoot, "views");
        if (await exists(viewsDir)) {
          manifest.__views.push({ base: manifestNamespace, dir: viewsDir });
        } else if (process.env.DEBUG === "true") {
          console?.debug?.(`no views dir: ${viewsDir}`);
        }

        // __partials
        const __partialsdir = path.join(plugingRoot, "views", "_partials");
        if (await exists(__partialsdir)) {
          manifest.__partials.push({ base: manifestNamespace, dir: __partialsdir });
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
        manifest.__routes[manifestNamespace] = {};

        const declaredRoutes = {};

        // API route entry (prefer manifest-declared path)
        let apiRoutesPath = null;
        if (declaredRoutes.api) {
          const absApi = path.join(plugingRoot, declaredRoutes.api);
          apiRoutesPath = (await exists(absApi)) ? absApi : null;
          if (!apiRoutesPath && process.env.DEBUG === "true") {
            console?.debug?.(`declared api route not found: ${absApi}`);
          }
        }
        if (!apiRoutesPath) {
          apiRoutesPath = await resolveRouteIndex(path.join(plugingRoot, "routes", "api"));
        }
        if (apiRoutesPath) {
          manifest.__routes[manifestNamespace]["api"] = {
            base: `/plugins/${manifestNamespace}`,
            path: apiRoutesPath,
          };
        } else if (process.env.DEBUG === "true") {
          console?.debug?.(`no api routes under ${path.join(plugingRoot, "routes", "api")}`);
        }

        // WEB route entry (prefer manifest-declared path)
        let webRoutesPath = null;
        if (declaredRoutes.web) {
          const absWeb = path.join(plugingRoot, declaredRoutes.web);
          webRoutesPath = (await exists(absWeb)) ? absWeb : null;
          if (!webRoutesPath && process.env.DEBUG === "true") {
            console?.debug?.(`declared web route not found: ${absWeb}`);
          }
        }
        if (!webRoutesPath) {
          webRoutesPath = await resolveRouteIndex(path.join(plugingRoot, "routes", "web"));
        }
        if (webRoutesPath) {
          manifest.__routes[manifestNamespace]["web"] = {
            base: `/${manifestNamespace}`,
            path: webRoutesPath,
          };
        } else if (process.env.DEBUG === "true") {
          console?.debug?.(`no web routes under ${path.join(plugingRoot, "routes", "web")}`);
        }
      }

      // Normalize optional top-level entryPoints to absolute paths (relative to plugin root)
      let normalizedEntryPoints = undefined;
      if (
        pluginManifest &&
        pluginManifest.entryPoints &&
        typeof pluginManifest.entryPoints === "object"
      ) {
        normalizedEntryPoints = {};
        for (const [k, rel] of Object.entries(pluginManifest.entryPoints)) {
          if (typeof rel !== "string" || !rel) continue;
          const absPath = path.join(plugingRoot, rel);
          if (await exists(absPath)) {
            normalizedEntryPoints[k] = absPath;
          } else if (process.env.DEBUG === "true") {
            console?.debug?.(`entryPoints.${k} not found under plugin root: ${absPath}`);
          }
        }
        // If none validated, keep it undefined to avoid misleading consumers
        if (Object.keys(normalizedEntryPoints).length === 0) normalizedEntryPoints = undefined;
      }

      plugins[manifestNamespace] = {
        namespace: manifestNamespace,
        entry,
        ...pluginManifest,
        ...(normalizedEntryPoints ? { entryPoints: normalizedEntryPoints } : {}),
      };
    }
  }

  const finalPlugins = {
    ...manifest.plugins,
    ...plugins,
  };

  // Pick projects and mdoules from plugins
  Object.keys(finalPlugins).forEach((k) => {
    const { id, name, namespace, sovereign, sidebarHidden } = finalPlugins[k];

    if (sovereign.allowMultipleInstances) {
      manifest.projects.push({
        id,
        label: name,
        value: namespace,
      });
    } else {
      manifest.modules.push({
        id,
        label: name,
        value: namespace,
        sidebarHidden,
      });
    }
  });

  const outputManifest = {
    ...manifest,
    allowedPluginTypes: [...new Set(manifest.allowedPluginTypes || [])],
    plugins: finalPlugins,
  };

  await fs.writeFile(__finalManifestPath, JSON.stringify(outputManifest, null, 2) + "\n");
  console?.log?.(`➜ Enabled plugins: ${manifest.enabledPlugins.join(", ") || "(none)"}`);
  console?.log?.(`✓ Manifest written: ${__finalManifestPath}`);
};

await buildManifest();
