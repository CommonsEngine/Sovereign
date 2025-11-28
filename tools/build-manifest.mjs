/* eslint-disable import/order */
import Ajv from "ajv";
import dotenv from "dotenv";
import { randomBytes } from "node:crypto";
import { promises as fs } from "node:fs";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { createRequire } from "module";

import { collectPluginCapabilities } from "./lib/plugin-capabilities.mjs";
import { getIcon, getPaletteColor, hasIcon, hasPaletteToken } from "@sovereign/ui-assets";

/**
 * @typedef {import("@sovereign/types").PluginManifest} PluginManifest
 */

const require = createRequire(import.meta.url);
const pkg = require("../package.json");
const plarfotmPkg = require("../platform/package.json");

const INSTANCE_ID_LENGTH = 5;
const INSTANCE_ID_CHARS = "abcdefghijklmnopqrstuvwxyz0123456789";

const generateInstanceId = () => {
  const bytes = randomBytes(INSTANCE_ID_LENGTH);
  let id = "";
  for (let i = 0; i < INSTANCE_ID_LENGTH; i += 1) {
    id += INSTANCE_ID_CHARS[bytes[i] % INSTANCE_ID_CHARS.length];
  }
  return id;
};

function formatError(message, options = {}) {
  const { pluginDir, manifestPath } = options;
  const context = [pluginDir, manifestPath].filter(Boolean).join(" ");
  return context ? `${context}: ${message}` : message;
}

const DEFAULT_ICON_NAME = "default";
const DEFAULT_ICON_VIEWBOX = "0 0 24 24";
const SUPPORTED_PLUGIN_TYPES = ["module", "project"];
const RESERVED_NAMES = Object.freeze({
  routes: [
    "api",
    "auth",
    "login",
    "logout",
    "register",
    "ws",
    "public",
    "static",
    "assets",
    "css",
    "js",
    "manifest",
    "sw",
    "service-worker",
    "uploads",
  ],
  plugins: ["sovereign", "platform", "core", "admin"],
  keywords: ["favicon", "robots", "security", "health", "status"],
});

function normalizeRoleValue(role) {
  if (!role) return null;
  if (typeof role === "string") return role.trim().toLowerCase();
  if (typeof role === "number") return String(role);
  if (typeof role === "object") {
    if (typeof role.role === "string" && role.role.trim()) return role.role.trim().toLowerCase();
    if (typeof role.role === "number") return String(role.role);
    if (typeof role.id === "string" && role.id.trim()) return role.id.trim().toLowerCase();
    if (typeof role.id === "number") return String(role.id);
    if (typeof role.key === "string" && role.key.trim()) return role.key.trim().toLowerCase();
    if (typeof role.label === "string" && role.label.trim()) return role.label.trim().toLowerCase();
  }
  return null;
}

function resolvePluginFeatureAccess(manifestNamespace, pluginManifest) {
  const userCaps = pluginManifest?.sovereign?.userCapabilities;
  if (!Array.isArray(userCaps)) return null;
  const expectedKey = `user:plugin.${manifestNamespace}.feature`;
  const entry = userCaps.find((cap) => cap && cap.key === expectedKey);
  if (!entry) return null;
  const normalizedRoles = Array.isArray(entry.roles)
    ? entry.roles.map((role) => normalizeRoleValue(role)).filter(Boolean)
    : [];
  if (!normalizedRoles.length) return null;
  return { roles: Array.from(new Set(normalizedRoles)) };
}

function normalizeUiConfig(rawUi, context = {}) {
  const uiConfig = rawUi && typeof rawUi === "object" ? rawUi : {};

  const rawIconName = typeof uiConfig?.icon?.name === "string" ? uiConfig.icon.name.trim() : "";
  const iconName = rawIconName || DEFAULT_ICON_NAME;

  if (!hasIcon(iconName)) {
    throw new Error(formatError(`unknown icon "${iconName}" in ui.icon`, context));
  }

  const iconDefinition = getIcon(iconName);
  const iconSidebarHidden =
    typeof uiConfig?.icon?.sidebarHidden === "boolean" ? uiConfig.icon.sidebarHidden : false;

  const hasSidebarFlag = typeof uiConfig?.layout?.sidebar === "boolean";
  const hasHeaderFlag = typeof uiConfig?.layout?.header === "boolean";

  let normalizedPalette;
  if (uiConfig?.palette && typeof uiConfig.palette === "object") {
    normalizedPalette = {};
    for (const [slot, rawValue] of Object.entries(uiConfig.palette)) {
      if (!rawValue) continue;
      let tokenName = "";
      if (typeof rawValue === "string") {
        tokenName = rawValue.trim();
      } else if (typeof rawValue === "object" && rawValue !== null) {
        tokenName = typeof rawValue.token === "string" ? rawValue.token.trim() : "";
      }
      if (!tokenName || !hasPaletteToken(tokenName)) {
        const badValue =
          typeof rawValue === "string" ? rawValue : JSON.stringify(rawValue, null, 0);
        throw new Error(
          formatError(`unknown palette token "${badValue}" for ui.palette.${slot}`, context)
        );
      }

      const resolved = getPaletteColor(tokenName);
      if (!resolved) {
        throw new Error(
          formatError(`palette token "${tokenName}" has no registered value`, context)
        );
      }
      normalizedPalette[slot] = {
        token: tokenName,
        value: resolved,
      };
    }
    if (Object.keys(normalizedPalette).length === 0) {
      normalizedPalette = undefined;
    }
  }

  return {
    icon: {
      name: iconName,
      viewBox: iconDefinition.viewBox || DEFAULT_ICON_VIEWBOX,
      body: iconDefinition.body,
      sidebarHidden: iconSidebarHidden,
    },
    ...(normalizedPalette ? { palette: normalizedPalette } : {}),
    layout: {
      sidebar: hasSidebarFlag ? uiConfig.layout.sidebar !== false : true,
      header: hasHeaderFlag ? uiConfig.layout.header !== false : true,
    },
  };
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
  instanceId: generateInstanceId(),
  defaultTenantId: "tenant-0",
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
  allowedPluginFrameworks: [],
  reservedNames: RESERVED_NAMES,
  __rootdir,
  __pluginsdir,
  __datadir,
  __assets: [],
  __views: [],
  __partials: [],
  createdAt: null,
  updatedAt: null,
};

const pluginManifestSchema = {
  $id: "PluginManifest",
  type: "object",
  required: [
    "id",
    "name",
    "version",
    "framework",
    "type",
    "sovereign",
    "devOnly",
    "author",
    "license",
  ],
  additionalProperties: true,
  properties: {
    id: { type: "string", minLength: 1 },
    name: { type: "string", minLength: 1 },
    description: { type: "string" },
    version: { type: "string", minLength: 1 },
    framework: { type: "string", enum: ["js", "react"] },
    type: { type: "string", enum: ["module", "project"] },
    enabled: { type: "boolean" },
    devOnly: { type: "boolean" },
    enrollStrategy: { type: "string", enum: ["auto", "subscribe"] },
    author: { type: "string" },
    license: { type: "string" },
    ui: {
      type: "object",
      additionalProperties: true,
      properties: {
        icon: {
          type: "object",
          additionalProperties: true,
          properties: {
            name: { type: "string", minLength: 1 },
            variant: { type: "string" },
            viewBox: { type: "string" },
            body: { type: "string" },
            sidebarHidden: { type: "boolean" },
          },
          required: [],
        },
        palette: {
          type: "object",
          additionalProperties: {
            anyOf: [
              { type: "string", minLength: 1 },
              {
                type: "object",
                required: ["token", "value"],
                additionalProperties: false,
                properties: {
                  token: { type: "string", minLength: 1 },
                  value: { type: "string", minLength: 1 },
                },
              },
            ],
          },
        },
        layout: {
          type: "object",
          additionalProperties: false,
          properties: {
            sidebar: { type: "boolean" },
            header: { type: "boolean" },
          },
        },
      },
    },
    sovereign: {
      type: "object",
      required: ["schemaVersion"],
      additionalProperties: true,
      properties: {
        schemaVersion: { type: "integer", minimum: 1 },
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
    },
    corePlugin: { type: "boolean" },
  },
};

const ajv = new Ajv({
  allErrors: true,
  strict: false,
});

const validatePluginManifest = ajv.compile(pluginManifestSchema);

function normalizeManifestCapabilities(manifest, context = {}) {
  const normalized = {
    ...manifest,
    sovereign: { ...(manifest?.sovereign || {}) },
  };

  const moved = [];

  if (normalized.platformCapabilities && !normalized.sovereign.platformCapabilities) {
    normalized.sovereign.platformCapabilities = normalized.platformCapabilities;
    moved.push("platformCapabilities");
  }

  if (normalized.userCapabilities && !normalized.sovereign.userCapabilities) {
    normalized.sovereign.userCapabilities = normalized.userCapabilities;
    moved.push("userCapabilities");
  }

  if (normalized.platformCapabilities) delete normalized.platformCapabilities;
  if (normalized.userCapabilities) delete normalized.userCapabilities;

  if (moved.length) {
    console?.warn?.(
      formatError(
        `deprecated top-level field(s) moved under sovereign.*: ${moved.join(", ")}`,
        context
      )
    );
  }

  return normalized;
}

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
  const validationErrors = [];
  const seenNamespaces = new Set();
  const seenIds = new Set();
  const reserved = manifest.reservedNames || RESERVED_NAMES;

  // Preserve createdAt/instanceId and always update updatedAt
  let existingCreatedAt = null;
  let existingInstanceId = null;
  try {
    const existingManifestRaw = await fs.readFile(__finalManifestPath, "utf8");
    const existingManifest = JSON.parse(existingManifestRaw);
    existingCreatedAt = existingManifest.createdAt || null;
    existingInstanceId = existingManifest.instanceId || null;
  } catch {
    /* ignore */
  }
  manifest.createdAt = existingCreatedAt || new Date().toISOString();
  manifest.updatedAt = new Date().toISOString();
  if (existingInstanceId) {
    manifest.instanceId = existingInstanceId;
  }

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

    pluginManifest = normalizeManifestCapabilities(pluginManifest, {
      manifestPath: pluginManifestPath,
      pluginDir: plugingRoot,
    });

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

    const manifestEnabled = pluginManifest.enabled !== false;
    const isEnabledPlugin =
      process.env.NODE_ENV !== "production"
        ? manifestEnabled
        : manifestEnabled && !pluginManifest.devOnly;

    if (!manifest.allowedPluginFrameworks.includes(pluginManifest.framework)) {
      manifest.allowedPluginFrameworks.push(pluginManifest.framework);
    }

    if (!pluginManifest?.framework || !["react", "js"].includes(pluginManifest.framework)) {
      console?.warn?.(
        formatError(`unknown or missing plugin framework: ${pluginManifest?.framework}`, {
          manifestPath: pluginManifestPath,
          pluginDir: plugingRoot,
        })
      );
    }
    if (!pluginManifest?.type || !SUPPORTED_PLUGIN_TYPES.includes(pluginManifest.type)) {
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
    const manifestId = pluginManifest.id || "";

    const isReserved =
      (reserved?.routes || []).includes(manifestNamespace) ||
      (reserved?.plugins || []).includes(manifestNamespace) ||
      (reserved?.keywords || []).includes(manifestNamespace);

    if (isReserved) {
      validationErrors.push(
        formatError(
          `✗ namespace "${manifestNamespace}" is reserved (routes/plugins/keywords); update the plugin namespace.`,
          { manifestPath: pluginManifestPath, pluginDir: plugingRoot }
        )
      );
      continue;
    }

    if (seenNamespaces.has(manifestNamespace)) {
      validationErrors.push(
        formatError(`✗ duplicate namespace "${manifestNamespace}" detected`, {
          manifestPath: pluginManifestPath,
          pluginDir: plugingRoot,
        })
      );
      continue;
    }
    seenNamespaces.add(manifestNamespace);

    if (manifestId) {
      if (seenIds.has(manifestId)) {
        validationErrors.push(
          formatError(`✗ duplicate plugin id "${manifestId}" detected`, {
            manifestPath: pluginManifestPath,
            pluginDir: plugingRoot,
          })
        );
        continue;
      }
      seenIds.add(manifestId);
    }

    const enrollStrategy =
      pluginManifest.corePlugin === true
        ? "auto"
        : pluginManifest.enrollStrategy === "subscribe"
          ? "subscribe"
          : "auto";

    if (isEnabledPlugin) {
      manifest.enabledPlugins.push(`${manifestNamespace}@${pluginManifest.version}`);
    }

    const publicDir = path.join(plugingRoot, "public");
    const distDir = path.join(plugingRoot, "dist");

    let entry = path.join(plugingRoot, "index.js");

    // publicDir quiet check
    // TODO: Coinsider scoped the assets URLs
    if (await exists(publicDir)) {
      manifest.__assets.push({ base: "/", dir: publicDir });
    } else if (process.env.DEBUG === "true") {
      console?.debug?.(`no public dir: ${publicDir}`);
    }

    if (pluginManifest.framework === "react") {
      if (await exists(distDir)) {
        manifest.__assets.push({ base: `/plugins/${manifestNamespace}/`, dir: distDir });
      } else if (process.env.DEBUG === "true") {
        console?.debug?.(`no dist dir: ${distDir}`);
      }
    }

    if (pluginManifest.framework === "js") {
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

    const resolvedPlatformCaps = Object.entries(
      pluginManifest?.sovereign?.platformCapabilities || {}
    )
      .filter(([, enabled]) => !!enabled)
      .map(([key]) => key)
      .sort();

    const resolvedUserCaps = Array.isArray(pluginManifest?.sovereign?.userCapabilities)
      ? pluginManifest.sovereign.userCapabilities
          .map((cap) => (cap && typeof cap.key === "string" ? cap.key.trim() : ""))
          .filter(Boolean)
      : [];

    const normalizedSovereign = {
      ...(pluginManifest?.sovereign || {}),
      platformCapabilitiesResolved: resolvedPlatformCaps,
      userCapabilitiesResolved: resolvedUserCaps,
    };

    const featureAccess = resolvePluginFeatureAccess(manifestNamespace, pluginManifest);

    let normalizedUi;
    try {
      normalizedUi = normalizeUiConfig(pluginManifest?.ui, {
        pluginDir: plugingRoot,
        manifestPath: pluginManifestPath,
      });
    } catch (err) {
      console?.error?.(err?.message || err);
      continue;
    }

    plugins[manifestNamespace] = {
      namespace: manifestNamespace,
      entry,
      ...pluginManifest,
      enrollStrategy,
      ui: normalizedUi,
      featureAccess,
      sovereign: normalizedSovereign,
      ...(normalizedEntryPoints ? { entryPoints: normalizedEntryPoints } : {}),
    };
  }

  if (validationErrors.length) {
    validationErrors.forEach((msg) => console.error(msg));
    throw new Error(`Manifest build failed: ${validationErrors.length} validation error(s).`);
  }

  const finalPlugins = {
    ...manifest.plugins,
    ...plugins,
  };

  const {
    capabilities: capabilityCatalog,
    signature: capabilitySignature,
    diagnostics,
  } = await collectPluginCapabilities({ cwd: __rootdir });
  diagnostics.forEach((diag) => {
    if (diag.level === "error") {
      console.error(`✗ ${diag.message}`);
    } else {
      console.warn(`⚠️  ${diag.message}`);
    }
  });

  // Pick projects and mdoules from plugins
  Object.keys(finalPlugins).forEach((k) => {
    const { id, name, namespace, type, ui, featureAccess, corePlugin } = finalPlugins[k];
    const resolvedUi = ui || normalizeUiConfig(undefined);
    const iconHidden = resolvedUi?.icon?.sidebarHidden === true;
    const pluginType = type === "project" ? "project" : "module";

    if (pluginType === "project") {
      manifest.projects.push({
        id,
        label: name,
        value: namespace,
        ui: resolvedUi,
        access: featureAccess || null,
        corePlugin: !!corePlugin,
      });
    } else {
      manifest.modules.push({
        id,
        label: name,
        value: namespace,
        ui: resolvedUi,
        sidebarHidden: iconHidden,
        access: featureAccess || null,
        corePlugin: !!corePlugin,
      });
    }
  });

  const outputManifest = {
    ...manifest,
    allowedPluginFrameworks: [...new Set(manifest.allowedPluginFrameworks || [])],
    plugins: finalPlugins,
    pluginCapabilities: {
      signature: capabilitySignature,
      definitions: capabilityCatalog.map((cap) => ({
        key: cap.key,
        description: cap.description,
        source: cap.source,
        namespace: cap.namespace,
        scope: cap.scope,
        category: cap.category,
        assignments: cap.assignments,
      })),
    },
  };

  await fs.writeFile(__finalManifestPath, JSON.stringify(outputManifest, null, 2) + "\n");
  console?.log?.(`➜ Enabled plugins: ${manifest.enabledPlugins.join(", ") || "(none)"}`);
  console?.log?.(`✓ Manifest written: ${__finalManifestPath}`);

  // --- Generate OpenAPI spec for plugin APIs ---
  async function extractRoutesFromRouter(router) {
    const routes = [];
    if (!router || !router.stack || !Array.isArray(router.stack)) return routes;
    for (const layer of router.stack) {
      if (layer && layer.route && layer.route.path) {
        const path = layer.route.path;
        const methods = Object.keys(layer.route.methods || {}).filter(
          (m) => layer.route.methods[m]
        );
        for (const m of methods) {
          routes.push({ method: m.toLowerCase(), path });
        }
      } else if (layer && layer.name === "router" && layer.handle && layer.handle.stack) {
        // Nested router – best-effort recursion without mount prefix (Express does not expose it reliably here)
        const nested = await extractRoutesFromRouter(layer.handle);
        routes.push(...nested);
      }
    }
    return routes;
  }

  function toOpenApiPath(expressPath) {
    if (!expressPath) return "/";
    // Convert Express ":id" style params to OpenAPI "{id}"
    return String(expressPath).replace(/:([A-Za-z0-9_]+)/g, "{$1}");
  }

  async function resolvePluginApiRouter(entryAbs, pluginNamespace) {
    try {
      const href = pathToFileURL(entryAbs).href;
      const mod = await import(href);
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

      // If it's a factory, invoke it with a minimal context
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
          console?.warn?.(
            `⚠️  ${pluginNamespace}: router factory invocation failed for spec generation:`,
            e?.message || e
          );
          return null;
        }
      }

      if (exported && typeof exported === "function" && exported.stack) {
        return exported;
      }
    } catch (e) {
      console?.warn?.(
        `⚠️  Failed to import API router at ${entryAbs} for OpenAPI generation:`,
        e?.message || e
      );
    }
    return null;
  }

  async function buildOpenAPISpec(outputPath) {
    const openapi = {
      openapi: "3.0.3",
      info: {
        title: "Sovereign Plugin API",
        version: outputManifest?.platform?.version || "0.0.0",
        description: "Automatically generated from plugin Express routers at build time.",
      },
      servers: [{ url: "/", description: "Relative server (same-origin)" }],
      paths: {},
      tags: [],
      components: {},
    };

    for (const ns of Object.keys(finalPlugins)) {
      const plugin = finalPlugins[ns];
      const apiEntry = plugin?.entryPoints?.api;
      if (!apiEntry) continue;
      const router = await resolvePluginApiRouter(apiEntry, ns);
      if (!router) continue;

      const base = `/api/plugins/${ns}`;
      openapi.tags.push({ name: ns });

      const routes = await extractRoutesFromRouter(router);
      for (const r of routes) {
        const fullPath = base + toOpenApiPath(r.path || "/");
        const method = (r.method || "get").toLowerCase();
        if (!openapi.paths[fullPath]) openapi.paths[fullPath] = {};

        const isWrite = method === "post" || method === "put" || method === "patch";
        const isCreate = method === "post";

        openapi.paths[fullPath][method] = {
          tags: [ns],
          summary: `${ns} ${method.toUpperCase()} ${fullPath}`,
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

    await fs.writeFile(outputPath, JSON.stringify(openapi, null, 2) + "\n");
    console?.log?.(`✓ OpenAPI written: ${outputPath}`);
  }

  try {
    const openapiOut = path.join(__rootdir, "openapi.json");
    await buildOpenAPISpec(openapiOut);
  } catch (e) {
    console?.warn?.("⚠️  OpenAPI generation failed:", e?.message || e);
  }
};

await buildManifest();
