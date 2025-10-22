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
    if (typeof logger[method] === "function")
      return logger[method].bind(logger);
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
    trace: (...args) => parentLogger.trace(`[${pluginLabel}]`, ...args),
    debug: (...args) => parentLogger.debug(`[${pluginLabel}]`, ...args),
    info: (...args) => parentLogger.info(`[${pluginLabel}]`, ...args),
    warn: (...args) => parentLogger.warn(`[${pluginLabel}]`, ...args),
    error: (...args) => parentLogger.error(`[${pluginLabel}]`, ...args),
  };
}

/**
 * Creates the context object passed to plugin lifecycle callbacks.
 * Exposes scoped logging, config, mount metadata, isolated routers,
 * and shared service handles (db placeholder for now) in preparation
 * for future SDK expansion.
 */
function buildPluginContext({ manifest, services, logger, sandbox }) {
  const mounts = manifest.mounts || {};
  const routers = {};

  for (const key of Object.keys(mounts)) {
    routers[key] = express.Router({ mergeParams: true });
  }

  let defaultRouter = routers.api || routers.web;
  if (!defaultRouter) {
    defaultRouter = express.Router({ mergeParams: true });
  }

  if (!routers.default) {
    routers.default = defaultRouter;
  }

  return {
    manifest,
    logger,
    config: services.config || {},
    router: defaultRouter,
    routers,
    mounts,
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
  const pluginsDir = resolvePluginsDir(options.pluginsDir || "./src/plugins");
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

  function createPluginState(manifest) {
    return {
      manifest,
      module: null,
      context: null,
      sandbox: null,
      mountedRouters: [],
      status: "discovered",
      errors: [],
    };
  }

  function recordError(pluginState, hook, error) {
    const message = error?.stack || error?.message || String(error);
    pluginState.errors.push({ hook, error, message });
    return message;
  }

  async function invokeHook(pluginState, hookName, lifecycleOptions = {}) {
    const hook = pluginState.module?.[hookName];
    if (typeof hook !== "function") return true;

    try {
      await hook.call(
        pluginState.module,
        pluginState.context,
        lifecycleOptions,
      );
      return true;
    } catch (err) {
      const message = recordError(pluginState, hookName, err);
      try {
        pluginState.context?.logger?.error?.(
          `Plugin lifecycle hook "${hookName}" failed`,
          err,
        );
      } catch {
        // ignore logger errors
      }
      context.logger.error(
        `Extension host: plugin "${pluginState.manifest.name}" ${hookName} failed: ${message}`,
      );
      return false;
    }
  }

  async function mount(app) {
    if (!app || typeof app.use !== "function") {
      throw new Error(
        "Extension host mount requires an Express app instance with app.use()",
      );
    }

    context.plugins = [];

    if (context.manifests.length === 0) {
      context.logger.info("Extension host: no plugins discovered");
      return context.plugins;
    }

    for (const manifest of context.manifests) {
      const pluginState = createPluginState(manifest);

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

        pluginState.module = pluginModule;
        pluginState.context = pluginContext;
        pluginState.sandbox = sandbox;
        pluginState.status = "initialized";

        const registered = await invokeHook(pluginState, "register");
        if (!registered) {
          pluginState.status = "error";
          await pluginState.sandbox?.dispose?.();
          context.plugins.push(pluginState);
          continue;
        }

        pluginState.status = "registered";

        for (const [mountName, router] of Object.entries(
          pluginContext.routers,
        )) {
          const mountPath = pluginContext.mounts[mountName];
          if (!mountPath || typeof app.use !== "function") continue;

          app.use(mountPath, router);
          pluginState.mountedRouters.push({
            name: mountName,
            path: mountPath,
            router,
          });

          pluginLogger.debug(`Mounted router "${mountName}" at ${mountPath}`);
        }

        const lifecycleOptions = {
          tenantId: options.tenantId || "tenant-0",
        };

        const enabled = await invokeHook(
          pluginState,
          "onEnable",
          lifecycleOptions,
        );

        pluginState.status = enabled ? "enabled" : "error";

        if (pluginState.status === "enabled") {
          context.logger.info(
            `Extension host: loaded plugin ${manifest.name} v${manifest.version}`,
          );
        } else {
          context.logger.warn(
            `Extension host: plugin ${manifest.name} enabled with errors`,
          );
        }
      } catch (err) {
        const message = recordError(pluginState, "init", err);
        pluginState.status = "error";
        context.logger.error(
          `Extension host: failed to initialize plugin "${manifest.name}": ${message}`,
        );
        try {
          await pluginState.sandbox?.dispose?.();
        } catch (disposeErr) {
          context.logger.warn(
            `Extension host: sandbox dispose failed for "${manifest.name}" after init error: ${
              disposeErr?.message || disposeErr
            }`,
          );
        }
      }

      context.plugins.push(pluginState);
    }

    return context.plugins;
  }

  async function shutdown() {
    for (const plugin of context.plugins) {
      const lifecycleOptions = {
        tenantId: options.tenantId || "tenant-0",
        reason: "shutdown",
      };

      if (plugin.status === "enabled") {
        await invokeHook(plugin, "onDisable", lifecycleOptions);
      }
      await invokeHook(plugin, "onShutdown", lifecycleOptions);

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
