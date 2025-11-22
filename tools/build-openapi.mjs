/* eslint-disable import/order */
import fs from "node:fs/promises";
import path from "node:path";
import { pathToFileURL } from "node:url";

// Enable $/ alias resolution for dynamic imports of platform routes
import "../platform/scripts/register-alias.mjs";

const CORE_BASE = "/api";
const PLUGIN_BASE = "/api/plugins";

async function extractRoutesFromRouter(router) {
  const routes = [];
  if (!router || !router.stack || !Array.isArray(router.stack)) return routes;
  for (const layer of router.stack) {
    if (layer && layer.route && layer.route.path) {
      const routePath = layer.route.path;
      const methods = Object.keys(layer.route.methods || {}).filter((m) => layer.route.methods[m]);
      for (const m of methods) {
        routes.push({ method: m.toLowerCase(), path: routePath });
      }
    } else if (layer && layer.name === "router" && layer.handle && layer.handle.stack) {
      const nested = await extractRoutesFromRouter(layer.handle);
      routes.push(...nested);
    }
  }
  return routes;
}

function toOpenApiPath(expressPath) {
  if (!expressPath) return "/";
  return String(expressPath).replace(/:([A-Za-z0-9_]+)/g, "{$1}");
}

async function resolveRouter(entryAbs, namespace) {
  try {
    const mod = await import(pathToFileURL(entryAbs).href);
    let exported =
      mod?.default && typeof mod.default === "function" && mod.default.name === "router"
        ? mod.default
        : mod?.default && typeof mod.default === "function" && mod.default.name !== "router"
          ? mod.default
          : mod?.router
            ? mod.router
            : typeof mod === "function"
              ? mod()
              : null;

    if (typeof exported === "function" && !exported.stack) {
      const ctx = {
        logger: console,
        prisma: {},
        path,
        env: { nodeEnv: process.env.NODE_ENV },
        pluginAuth: { requireAuthz: () => (req, res, next) => next?.() },
        auth: { require: () => (req, res, next) => next?.() },
      };
      try {
        exported = exported(ctx);
      } catch (e) {
        console?.warn?.(`⚠️  ${namespace}: router factory invocation failed:`, e?.message || e);
        return null;
      }
    }

    if (exported && typeof exported === "function" && exported.stack) {
      return exported;
    }
  } catch (e) {
    console?.warn?.(
      `⚠️  Failed to import router at ${entryAbs}${namespace ? ` (${namespace})` : ""}:`,
      e?.message || e
    );
  }
  return null;
}

async function collectRoutes(entries, basePrefix) {
  const paths = {};
  for (const { namespace, entry } of entries) {
    const router = await resolveRouter(entry, namespace);
    if (!router) continue;
    const base = `${basePrefix}/${namespace}`.replace(/\/+/g, "/");
    const routes = await extractRoutesFromRouter(router);
    for (const r of routes) {
      const fullPath = (base + toOpenApiPath(r.path || "/")).replace(/\/+/g, "/");
      const method = (r.method || "get").toLowerCase();
      if (!paths[fullPath]) paths[fullPath] = {};
      const isWrite = ["post", "put", "patch"].includes(method);
      const isCreate = method === "post";
      paths[fullPath][method] = {
        tags: [namespace],
        summary: `${namespace} ${method.toUpperCase()} ${fullPath}`,
        requestBody: isWrite
          ? {
              required: false,
              content: {
                "application/json": {
                  schema: { type: "object", additionalProperties: true },
                },
              },
            }
          : undefined,
        responses: {
          ...(isCreate ? { 201: { description: "Created" } } : { 200: { description: "OK" } }),
          400: { description: "Bad Request" },
          401: { description: "Unauthorized" },
          404: { description: "Not Found" },
        },
      };
    }
  }
  return paths;
}

/**
 * Build OpenAPI spec for core and plugin APIs.
 * @param {object} options
 * @param {Record<string, any>} options.plugins - plugins map from manifest
 * @param {string} options.outPath - output path for openapi.json
 * @param {string} options.coreApiDir - absolute path to platform/src/routes/api
 * @param {string} options.platformVersion - version string
 */
export async function buildOpenAPISpec({
  plugins = {},
  outPath,
  coreApiDir,
  platformVersion = "0.0.0",
  rootDir,
  pluginsDir,
  dataDir,
}) {
  if (rootDir && !process.env.ROOT_DIR) process.env.ROOT_DIR = rootDir;
  if (pluginsDir && !process.env.PLUGIN_DIR) process.env.PLUGIN_DIR = pluginsDir;
  if (dataDir && !process.env.DATA_DIR) process.env.DATA_DIR = dataDir;
  const openapi = {
    openapi: "3.0.3",
    info: {
      title: "Sovereign API",
      version: platformVersion,
      description: "Core and plugin APIs (auto-generated).",
    },
    servers: [{ url: "/", description: "Relative server (same-origin)" }],
    paths: {},
    tags: [],
    components: {},
  };

  // Core API routes (platform/src/routes/api/*.js)
  const coreEntries = [];
  try {
    const files = await fs.readdir(coreApiDir);
    for (const file of files) {
      if (!file.endsWith(".js")) continue;
      coreEntries.push({
        namespace: path.basename(file, ".js"),
        entry: path.join(coreApiDir, file),
      });
    }
  } catch (e) {
    console?.warn?.(`⚠️  Unable to read core API routes in ${coreApiDir}:`, e?.message || e);
  }

  // Plugin API entryPoints (manifest.plugins[ns].entryPoints.api)
  const pluginEntries = Object.keys(plugins || [])
    .map((ns) => {
      const entry = plugins[ns]?.entryPoints?.api;
      return entry ? { namespace: ns, entry } : null;
    })
    .filter(Boolean);

  const corePaths = await collectRoutes(coreEntries, CORE_BASE);
  const pluginPaths = await collectRoutes(pluginEntries, PLUGIN_BASE);

  const allPaths = { ...corePaths };
  for (const [k, v] of Object.entries(pluginPaths)) {
    allPaths[k] = { ...(allPaths[k] || {}), ...v };
  }

  openapi.paths = allPaths;
  openapi.tags = [
    ...coreEntries.map((c) => ({ name: `core:${c.namespace}` })),
    ...pluginEntries.map((p) => ({ name: p.namespace })),
  ];

  await fs.writeFile(outPath, JSON.stringify(openapi, null, 2) + "\n");
  console?.log?.(`✓ OpenAPI written: ${outPath}`);
}

export default buildOpenAPISpec;
