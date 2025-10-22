// eslint-disable-next-line import/order
import express from "express";
import fs from "fs/promises";
import path from "path";
import { pathToFileURL } from "url";

import { discoverManifests } from "./loader.mjs";
import { createSandbox } from "./sandbox.mjs";

function resolvePluginsDir(pluginsDir) {
  if (!pluginsDir) {
    throw new Error("pluginsDir is required to initialize the extension host");
  }

  const parsed = path.isAbsolute(pluginsDir)
    ? pluginsDir
    : path.join(process.cwd(), pluginsDir);

  return parsed;
}

function coerceLogger(logger) {
  if (!logger) return console;

  const mapMethod = (method) => {
    if (typeof logger[method] === "function") return logger[method].bind(logger);
    return console[method]?.bind(console) || console.log.bind(console);
  };

  return {
    trace: mapMethod("trace"),
    debug: mapMethod("debug"),
    info: mapMethod("info"),
    warn: mapMethod("warn"),
    error: mapMethod("error"),
  };
}

function createPluginLogger(parentLogger, manifest) {
  const pluginLabel = manifest.name || manifest.directoryName;
  return {
    trace: (...args) =>
      parentLogger.trace(`[${pluginLabel}]`, ...args),
    debug: (...args) =>
      parentLogger.debug(`[${pluginLabel}]`, ...args),
    info: (...args) =>
      parentLogger.info(`[${pluginLabel}]`, ...args),
    warn: (...args) =>
      parentLogger.warn(`[${pluginLabel}]`, ...args),
    error: (...args) =>
      parentLogger.error(`[${pluginLabel}]`, ...args),
  };
}

/**
 * Creates the context object passed to plugin lifecycle callbacks.
 * This will grow over time; for now it only exposes logger, config,
 * an isolated router, the placeholder database handle, and the sandbox.
 */
function buildPluginContext({ manifest, services, logger, sandbox }) {
  const router = express.Router();

  return {
    manifest,
    logger,
    config: services.config || {},
    router,
    db: services.database ?? null,
    services,
    sandbox,
  };
}

async function ensureEntryExists(manifest) {
  const entryPath = path.resolve(
    manifest.absoluteDir,
    manifest.sovereign.entry,
  );

  try {
    await fs.access(entryPath);
  } catch (err) {
    if (err.code === "ENOENT") {
      throw new Error(
        `Plugin entry module "${manifest.sovereign.entry}" not found for ${manifest.name}`,
      );
    }
    throw err;
  }

  return entryPath;
}

async function loadPluginModule(entryPath) {
  const moduleURL = pathToFileURL(entryPath).href;
  const imported = await import(moduleURL);
  return imported.default || imported;
}

export async function createExtHost(services = {}, options = {}) {
  const pluginsDir = resolvePluginsDir(
    options.pluginsDir || "./src/plugins",
  );
  const sandboxFactory = options.createSandbox || createSandbox;
  const baseLogger = coerceLogger(
    options.logger || services.logger || global.logger || console,
  );

  const context = {
    services,
    pluginsDir,
    sandboxFactory,
    logger: baseLogger,
    manifests: [],
    plugins: [],
  };

  async function init() {
    context.manifests = await discoverManifests(pluginsDir, {
      logger: context.logger,
    });
  }

  async function mount(app) {
    void app;
    context.plugins = [];

    if (context.manifests.length === 0) {
      context.logger.info("Extension host: no plugins discovered");
      return context.plugins;
    }

    for (const manifest of context.manifests) {
      try {
        const entryPath = await ensureEntryExists(manifest);
        const pluginModule = await loadPluginModule(entryPath);
        const sandbox = sandboxFactory(manifest, {
          services: context.services,
          logger: context.logger,
        });
        const pluginLogger = createPluginLogger(context.logger, manifest);
        const pluginContext = buildPluginContext({
          manifest,
          services: context.services,
          logger: pluginLogger,
          sandbox,
        });

        if (typeof pluginModule?.register === "function") {
          await pluginModule.register(pluginContext);
        }

        context.plugins.push({
          manifest,
          module: pluginModule,
          context: pluginContext,
          sandbox,
          status: "registered",
        });

        context.logger.info(
          `Extension host: loaded plugin ${manifest.name} v${manifest.version}`,
        );
      } catch (err) {
        context.logger.error(
          `Extension host: failed to initialize plugin "${manifest.name}": ${err.message}`,
        );
      }
    }

    return context.plugins;
  }

  async function shutdown() {
    for (const plugin of context.plugins) {
      try {
        await plugin.sandbox.dispose?.();
      } catch (err) {
        context.logger.warn(
          `Extension host: sandbox dispose failed for "${plugin.manifest.name}": ${err.message}`,
        );
      }
    }
  }

  return {
    init,
    mount,
    shutdown,
    get manifests() {
      return context.manifests;
    },
    get plugins() {
      return context.plugins;
    },
  };
}

export { discoverManifests } from "./loader.mjs";
