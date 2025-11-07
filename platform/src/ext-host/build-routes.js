import path from "node:path";
import { pathToFileURL } from "url";

import logger from "$/services/logger.mjs";
import ensurePluginLayout from "$/middlewares/ensurePluginLayout.js";
import { requireAuth } from "$/middlewares/auth.mjs";
import exposeGlobals from "$/middlewares/exposeGlobals.mjs";
import * as pluginHandler from "$/handlers/plugin.js";

import { resolvePluginCapabilities } from "./capabilities.mjs";

export async function buildPluginRoutes(app, manifest, config) {
  const { plugins } = manifest;
  const { NODE_ENV } = config;

  const pluginContextCache = new Map();

  const ensurePluginContext = (plugin, namespace) => {
    const cacheKey = namespace || plugin?.namespace || plugin?.id;
    if (cacheKey && pluginContextCache.has(cacheKey)) {
      return pluginContextCache.get(cacheKey);
    }

    const baseContext = {
      env: { nodeEnv: NODE_ENV },
      logger,
      path,
    };

    const { context: capabilityContext, granted } = resolvePluginCapabilities(plugin, {
      config,
      logger,
    });

    const pluginContext = {
      ...baseContext,
      platformCapabilities: Object.freeze([...granted]),
      ...capabilityContext,
    };

    if (plugin) {
      plugin.__grantedPlatformCapabilities = granted;
    }

    const logNamespace = namespace || plugin?.namespace || plugin?.id || "<unknown>";
    logger.info(
      `[plugins] ${logNamespace}: granted platform capabilities → ${
        granted.length ? granted.join(", ") : "(none)"
      }`
    );

    if (cacheKey) {
      pluginContextCache.set(cacheKey, pluginContext);
    }

    return pluginContext;
  };

  if (plugins && typeof plugins === "object") {
    for (const ns of Object.keys(plugins)) {
      const plugin = plugins[ns];
      const pluginType = plugin.type; // spa | custom
      const pluginKind = plugin?.sovereign?.allowMultipleInstances ? "project" : "module";
      const pluginKey = `${pluginType}::${pluginKind}`;

      let pluginContext;
      try {
        pluginContext = ensurePluginContext(plugin, ns);
      } catch (err) {
        logger.error(`[plugins] ${ns}: capability resolution failed`, err);
        continue;
      }

      if (pluginType === "spa") {
        if (pluginKey === "spa::module") {
          app.get(`/${ns}`, requireAuth, exposeGlobals, (req, res, next) => {
            return pluginHandler.renderSPAModule(req, res, next, { app, plugin });
          });
        }
        if (pluginKey === "spa::project") {
          app.get(`/${ns}/:id`, requireAuth, exposeGlobals, (req, res, next) => {
            return pluginHandler.renderSPA(req, res, next, { app, plugins });
          });
        }

        // SPA API Routes
        const entryPoint = plugin?.entryPoints?.api;
        if (entryPoint) {
          const entryAbs = path.resolve(entryPoint);
          const entryUrl = pathToFileURL(entryAbs).href;

          try {
            const mod = await import(entryUrl);
            const router =
              mod?.default && typeof mod.default === "function" && mod.default.name === "router"
                ? mod.default
                : mod?.default && typeof mod.default === "function" && mod.default.name !== "router"
                  ? mod.default
                  : mod?.router
                    ? mod.router
                    : typeof mod === "function"
                      ? mod()
                      : null;

            // If default export is a function but not an Express Router yet, try invoking it
            let resolvedRouter = router;

            // If it's a function (factory), call it with context
            if (typeof router === "function" && !router.stack) {
              try {
                resolvedRouter = router(pluginContext);
              } catch (err) {
                logger.error(`[plugins] spa:${ns}/web: router factory threw an error`, err);
                continue;
              }
            }

            if (!resolvedRouter || typeof resolvedRouter !== "function" || !resolvedRouter.stack) {
              logger.warn(
                `[plugins] spa:${ns}/web: entry did not export an Express Router at ${entryAbs}`
              );
              continue;
            }

            const middlewares = [requireAuth, exposeGlobals];

            const mountBase = `/api/plugins/${ns}`;
            app.use(mountBase, ...middlewares, resolvedRouter);
          } catch (err) {
            logger.error(`[plugins] failed to load spa:${ns}/web from ${entryAbs}:`, err);
          }
        }
      }

      if (pluginType === "custom") {
        const kinds = ["web", "api"];
        for (const kind of kinds) {
          const entryPoint = plugin?.entryPoints[kind];
          if (entryPoint) {
            const entryAbs = path.resolve(entryPoint);
            const entryUrl = pathToFileURL(entryAbs).href;

            try {
              const mod = await import(entryUrl);
              const router =
                mod?.default && typeof mod.default === "function" && mod.default.name === "router"
                  ? mod.default
                  : mod?.default &&
                      typeof mod.default === "function" &&
                      mod.default.name !== "router"
                    ? mod.default
                    : mod?.router
                      ? mod.router
                      : typeof mod === "function"
                        ? mod()
                        : null;

              // If default export is a function but not an Express Router yet, try invoking it
              let resolvedRouter = router;

              // If it's a function (factory), call it with context
              if (typeof router === "function" && !router.stack) {
                try {
                  resolvedRouter = router(pluginContext);
                } catch (err) {
                  logger.error(`[plugins] ${ns}/${kind}: router factory threw an error`, err);
                  continue;
                }
              }

              if (
                !resolvedRouter ||
                typeof resolvedRouter !== "function" ||
                !resolvedRouter.stack
              ) {
                logger.warn(
                  `[plugins] ${ns}/${kind}: entry did not export an Express Router at ${entryAbs}`
                );
                continue;
              }

              const middlewares = [requireAuth, exposeGlobals];
              if (kind === "web") {
                middlewares.push(ensurePluginLayout("custom/index"));
              }

              let mountBase = `/${ns}`;
              if (kind === "api") {
                mountBase = `/api/plugins/${ns}`;
              }
              app.use(mountBase, ...middlewares, resolvedRouter);
            } catch (err) {
              logger.error(`[plugins] failed to load ${ns}/${kind} from ${entryAbs}:`, err);
            }
          }
        }
      }
    }
  }
}
