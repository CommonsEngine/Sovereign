import path from "node:path";
import { pathToFileURL } from "url";

import { prisma } from "$/services/database.mjs";
import logger from "$/services/logger.mjs";
import * as git from "$/libs/git/registry.mjs";
import fm from "$/libs/fs.mjs";
import { uuid } from "$/utils/id.mjs";
import ensurePluginLayout from "$/middlewares/ensurePluginLayout.js";
import { requireAuth } from "$/middlewares/auth.mjs";
import exposeGlobals from "$/middlewares/exposeGlobals.mjs";
import * as pluginHandler from "$/handlers/plugin.js";

export async function buildPluginRoutes(app, manifest, config) {
  const { plugins } = manifest;
  const { NODE_ENV } = config;

  if (plugins && typeof plugins === "object") {
    for (const ns of Object.keys(plugins)) {
      const plugin = plugins[ns];
      const pluginType = plugin.type; // spa | custom
      const pluginKind = plugin?.sovereign?.allowMultipleInstances ? "project" : "module";
      const pluginKey = `${pluginType}::${pluginKind}`;

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
                  // TODO: Finalize plugin context
                  // This should be compile based on plugin.platformCapabilities[]
                  const pluginContext = {
                    env: { nodeEnv: NODE_ENV },
                    logger,
                    prisma,
                    git,
                    fm,
                    path,
                    uuid,
                  };
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

  /** --- Plugin Routes (entry-point router mode) ---
   * Each entry in `__routes[namespace]` is expected to look like:
   * {
   *  web: { base: "plugins/<ns>", path: "/abs/path/to/routes/web/index.js" },
   *  api: { base: "plugins/<ns>", path: "/abs/path/to/routes/api/index.js" }
   * }
   * The module at `path` must export an Express Router (default, named `router`,
   * or a factory function returning a router).
   **/
  // if (__routes && typeof __routes === "object") {
  //   const kinds = ["web", "api"];

  //   for (const ns of Object.keys(__routes)) {
  //     const cfgByKind = __routes[ns] || {};

  //     for (const kind of kinds) {
  //       const cfg = cfgByKind[kind];

  //       if (cfg) {
  //         const baseClean = (cfg.base || `plugins/${ns}`).replace(/^\/+|\/+$/g, "");
  //         const mountBase = kind === "web" ? `/${baseClean}` : `/api/${baseClean}`;
  //         const entryAbs = path.resolve(cfg.path);
  //         const entryUrl = pathToFileURL(entryAbs).href;

  //         try {
  //           const mod = await import(entryUrl);
  //           const router =
  //             mod?.default && typeof mod.default === "function" && mod.default.name === "router"
  //               ? mod.default
  //               : mod?.default && typeof mod.default === "function" && mod.default.name !== "router"
  //                 ? mod.default
  //                 : mod?.router
  //                   ? mod.router
  //                   : typeof mod === "function"
  //                     ? mod()
  //                     : null;

  //           // If default export is a function but not an Express Router yet, try invoking it
  //           let resolvedRouter = router;

  //           // If it's a function (factory), call it with context
  //           if (typeof router === "function" && !router.stack) {
  //             try {
  //               // TODO: Finalize plugin context
  //               // This should be compile based on plugin.platformCapabilities[]
  //               const pluginContext = {
  //                 env: { nodeEnv: NODE_ENV },
  //                 logger,
  //                 prisma,
  //                 git,
  //                 fm,
  //                 path,
  //                 uuid,
  //               };
  //               resolvedRouter = router(pluginContext);
  //             } catch (err) {
  //               logger.error(`[plugins] ${ns}/${kind}: router factory threw an error`, err);
  //               continue;
  //             }
  //           }

  //           if (!resolvedRouter || typeof resolvedRouter !== "function" || !resolvedRouter.stack) {
  //             logger.warn(
  //               `[plugins] ${ns}/${kind}: entry did not export an Express Router at ${entryAbs}`
  //             );
  //             continue;
  //           }

  //           const middlewares = [requireAuth, exposeGlobals];
  //           if (kind === "web") {
  //             middlewares.push(ensurePluginLayout("custom/index"));
  //           }

  //           app.use(mountBase, ...middlewares, resolvedRouter);
  //           logger.info(`[plugins] mounted ${kind} routes for "${ns}" at ${mountBase}`);
  //         } catch (err) {
  //           logger.error(`[plugins] failed to load ${ns}/${kind} from ${entryAbs}:`, err);
  //         }
  //       }
  //     }
  //   }
  // }
}
