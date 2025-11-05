/* eslint-disable import/order */
import express from "express";
import helmet from "helmet";
import compression from "compression";
import morgan from "morgan";
import cookieParser from "cookie-parser";
import { engine as hbsEngine } from "express-handlebars";
import fs from "fs/promises";
import path from "path";
import { pathToFileURL } from "url";

import { prisma } from "$/services/database.mjs";
import logger from "$/services/logger.mjs";
import * as git from "$/libs/git/registry.mjs";
import fm from "$/libs/fs.mjs";

import secure from "$/middlewares/secure.mjs";
import { requireAuth, disallowIfAuthed } from "$/middlewares/auth.mjs";
import exposeGlobals from "$/middlewares/exposeGlobals.mjs";
import useJSX from "$/middlewares/useJSX.mjs";
import requireRole from "$/middlewares/requireRole.mjs";
import ensurePluginLayout from "./middlewares/ensurePluginLayout.js";

import * as indexHandler from "$/handlers/index.mjs";
import * as authHandler from "$/handlers/auth/index.mjs";
import * as usersHandler from "$/handlers/users/index.mjs";
import * as settingsHandler from "$/handlers/settings/index.mjs";
import * as appHandler from "$/handlers/app.mjs";
import * as pluginHandler from "./handlers/plugin.js";

import apiProjects from "$/routes/api/projects.js";

import env from "$/config/env.mjs";

import "$/utils/hbsHelpers.mjs";
import { uuid } from "$/utils/id.mjs";

const config = env();
const { __publicdir, __templatedir, __datadir, PORT, NODE_ENV, IS_PROD, APP_VERSION } = config;

export default async function createServer(manifest) {
  const app = express();

  const { plugins, __assets, __views, __partials, __routes, __spaentrypoints } = manifest;

  // Ensure data root exist at startup
  await fs.mkdir(__datadir, { recursive: true });

  // Vite is used for JSX/TSX SSR in dev (middleware mode)
  let createViteServer;
  if (!IS_PROD) {
    // Lazy require to avoid hard dependency in production builds
    ({ createServer: createViteServer } = await import("vite"));
  }

  // --- Vite (dev) for JSX/TSX SSR ----
  if (NODE_ENV !== "production") {
    const vite = await createViteServer({
      server: {
        middlewareMode: true,
        // Allow reverse-proxy Host headers from local dev domains
        allowedHosts: ["sovereign.test", "localhost", "127.0.0.1"],
        // Make Vite's HMR client use the same host when proxied via Caddy
        hmr: { host: "sovereign.test", protocol: "wss" },
      },
      appType: "custom",
    });
    app.locals.vite = vite;
    app.use(vite.middlewares);
  }

  // Trust proxy (needed if running behind reverse proxy to set secure cookies properly)
  app.set("trust proxy", true);

  // Core middleware
  app.use(
    helmet({
      contentSecurityPolicy: IS_PROD
        ? {
            useDefaults: true,
            directives: {
              "script-src": ["'self'", "'unsafe-inline'"], // replace inline with nonces later
              "img-src": ["'self'", "data:"],
            },
          }
        : false,
    })
  );
  app.use(compression());
  app.use(morgan(NODE_ENV === "production" ? "combined" : "dev"));
  app.use(express.json({ limit: "1mb" }));
  app.use(express.urlencoded({ extended: true }));
  app.use(cookieParser());

  // Security headers
  app.use(secure);

  app.use(useJSX);

  // View engine
  app.engine(
    "html",
    hbsEngine({
      extname: ".html",
      defaultLayout: false,
      layoutsDir: path.join(__templatedir, "layouts"),
      partialsDir: [
        path.join(__templatedir, "_partials"),
        ...__partials.map(({ dir }) => path.resolve(dir)),
      ],
    })
  );
  app.set("view engine", "html");
  /** TODO:
   * - Maybe we can expose a new render method to handle rendering logic in plugins
   * - Currently, plugins need to keep their views manually scoped, we need a way to improve DX here.
   * - app.renderScoped()
   */
  app.set("views", [__templatedir, ...__views.map(({ dir }) => path.resolve(dir))]);

  // Enable template caching in production
  app.set("view cache", NODE_ENV === "production");

  // Serve everything under /public at the root
  // TODO: Consider moving this into a small utility like utils/cacheHeaders.mjs
  // since we’ll likely reuse it for plugin assets.
  const staticOptions = {
    index: false,
    setHeaders: (res, filePath) => {
      if (NODE_ENV === "production") {
        const ext = path.extname(filePath).toLowerCase();
        const longCacheExts = new Set([
          ".js",
          ".css",
          ".svg",
          ".png",
          ".jpg",
          ".jpeg",
          ".gif",
          ".webp",
          ".ico",
          ".woff",
          ".woff2",
          ".ttf",
          ".eot",
          ".mp4",
          ".webm",
        ]);
        if (longCacheExts.has(ext)) {
          res.setHeader("Cache-Control", "public, max-age=31536000, immutable");
        } else {
          res.setHeader("Cache-Control", "public, max-age=300");
        }
      } else {
        res.setHeader("Cache-Control", "no-store");
      }
    },
  };
  app.use(express.static(__publicdir, staticOptions));

  for (const { base, dir } of __assets) {
    const cleaned = `/${String(base).replace(/^\/+|\/+$/g, "")}`;
    app.use(cleaned, express.static(path.resolve(dir), staticOptions));
  }

  app.use(
    "/uploads",
    express.static(path.join(__datadir, "upload"), {
      index: false,
      setHeaders: (res) => {
        if (NODE_ENV === "production") {
          res.setHeader("Cache-Control", "public, max-age=86400");
        } else {
          res.setHeader("Cache-Control", "no-store");
        }
      },
    })
  );

  if (!IS_PROD) {
    // --- Demo routes ---
    // Example route for React-SSR handled view (captures any subpath)
    app.get(/^\/example\/react(?:\/(.*))?$/, requireAuth, exposeGlobals, async (req, res, next) => {
      try {
        const subpath = req.params[0] || "";
        await res.renderJSX("example/react/index", { path: subpath });
      } catch (e) {
        next(e);
      }
    });
  }

  // Auth Routes
  app.post("/auth/invite", requireAuth, authHandler.inviteUser);
  app.get("/auth/guest", authHandler.guestLogin);
  app.get("/auth/me", requireAuth, authHandler.getCurrentUser);
  app.get("/auth/verify", authHandler.verifyToken); // Request /?token=...
  app.post("/auth/password/forgot", authHandler.forgotPassword); // Request Body { email }
  app.post("/auth/password/reset", authHandler.resetPassword); // Request Body { token, password }

  // Web Routes
  app.get("/", requireAuth, exposeGlobals, indexHandler.viewIndex);
  app.get("/login", disallowIfAuthed, exposeGlobals, authHandler.viewLogin);
  app.post("/login", authHandler.login);
  app.get("/register", disallowIfAuthed, exposeGlobals, authHandler.viewRegister);
  app.post("/register", authHandler.register);
  app.get("/logout", exposeGlobals, authHandler.logout);

  // User Routes (Web)
  app.get(
    "/users",
    requireAuth,
    exposeGlobals,
    requireRole(["platform:admin", "tenant:admin", "project:admin"]),
    usersHandler.viewUsers
  );
  // User Routes (API)
  app.delete(
    "/api/users/:id",
    requireAuth,
    requireRole(["platform:admin"]),
    usersHandler.deleteUser
  );

  // Settings Routes (Web)
  app.get(
    "/settings",
    requireAuth,
    exposeGlobals,
    requireRole(["platform:admin", "tenant:admin", "project:admin"]),
    settingsHandler.viewSettings
  );
  // Settings Routes (API)
  app.get("/api/settings", requireAuth, requireRole(["platform:admin"]), appHandler.getAppSettings);
  app.patch(
    "/api/settings",
    requireAuth,
    requireRole(["platform:admin"]),
    appHandler.updateAppSettings
  );

  // Project Routes
  app.use("/api/projects", apiProjects);

  // Build Plugin Routes
  for (const ns of Object.keys(plugins)) {
    const plugin = plugins[ns];

    if (plugin.type === "custom" && plugin?.sovereign?.allowMultipleInstances) {
      // TODO: Handle custom plugins / allowMultipleInstances = true;
    }

    if (plugin.type === "custom" && !plugin?.sovereign?.allowMultipleInstances) {
      // TODO: Handle custom plugins / allowMultipleInstances = false;
    }

    if (plugin.type === "spa" && plugin?.sovereign?.allowMultipleInstances) {
      // TODO: Fix this with a plugin type match to this case
      app.get(`/${ns}`, requireAuth, exposeGlobals, (req, res, next) => {
        // TODO: Pass pluginContext to SPA
        return pluginHandler.renderSPA(req, res, next, { app, plugins });
      });
    }

    if (plugin.type === "spa" && !plugin?.sovereign?.allowMultipleInstances) {
      app.get(`/${ns}/:id`, requireAuth, exposeGlobals, (req, res, next) => {
        // TODO: Pass pluginContext to SPA
        return pluginHandler.renderSPA(req, res, next, { app, plugins });
      });
    }
  }

  // SPA Routes
  // if (__spaentrypoints && Array.isArray(__spaentrypoints)) {
  //   for (const { ns } of __spaentrypoints) {
  //     app.get(`/${ns}/:id`, requireAuth, exposeGlobals, (req, res, next) => {
  //       return pluginHandler.renderSPA(req, res, next, { app, plugins });
  //     });
  //   }
  // }

  /** --- Plugin Routes (entry-point router mode) ---
   * Each entry in `__routes[namespace]` is expected to look like:
   * {
   *  web: { base: "plugins/<ns>", path: "/abs/path/to/routes/web/index.js" },
   *  api: { base: "plugins/<ns>", path: "/abs/path/to/routes/api/index.js" }
   * }
   * The module at `path` must export an Express Router (default, named `router`,
   * or a factory function returning a router).
   **/
  if (__routes && typeof __routes === "object") {
    const kinds = ["web", "api"];

    for (const ns of Object.keys(__routes)) {
      const cfgByKind = __routes[ns] || {};

      for (const kind of kinds) {
        const cfg = cfgByKind[kind];

        if (cfg) {
          const baseClean = (cfg.base || `plugins/${ns}`).replace(/^\/+|\/+$/g, "");
          const mountBase = kind === "web" ? `/${baseClean}` : `/api/${baseClean}`;
          const entryAbs = path.resolve(cfg.path);
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

            if (!resolvedRouter || typeof resolvedRouter !== "function" || !resolvedRouter.stack) {
              logger.warn(
                `[plugins] ${ns}/${kind}: entry did not export an Express Router at ${entryAbs}`
              );
              continue;
            }

            const middlewares = [requireAuth, exposeGlobals];
            if (kind === "web") {
              middlewares.push(ensurePluginLayout("custom/index"));
            }

            app.use(mountBase, ...middlewares, resolvedRouter);
            logger.info(`[plugins] mounted ${kind} routes for "${ns}" at ${mountBase}`);
          } catch (err) {
            logger.error(`[plugins] failed to load ${ns}/${kind} from ${entryAbs}:`, err);
          }
        }
      }
    }
  }

  // 404
  app.use((req, res) => {
    if (req.path.startsWith("/api/")) return res.status(404).json({ error: "Not found" });
    return res.status(404).render("error", {
      code: 404,
      message: "Page not found",
      description: "The page you’re looking for doesn’t exist.",
    });
  });

  // Central error handler
  app.use((err, req, res, next) => {
    logger.error("✗ ", err);
    if (res.headersSent) return next(err);
    if (req.path.startsWith("/api/")) {
      return res.status(500).json({ error: "Internal server error" });
    }
    return res.status(500).render("error", {
      code: 500,
      message: "Something went wrong",
      description: "Please try again later.",
      error: err.stack,
      nodeEnv: NODE_ENV,
    });
  });

  // Start/Stop controls for bootstrap
  let httpServer = null;

  async function start() {
    await new Promise((resolve) => {
      httpServer = app.listen(PORT, () => {
        logger.info(`  ➜  Server running at http://localhost:${PORT}`);
        resolve();
      });
    });
    return httpServer;
  }

  async function stop() {
    if (!httpServer) return;
    await new Promise((resolve) => httpServer.close(resolve));
  }

  const services = {
    app,
    logger,
    config,
    database: { prisma },
  };

  return {
    app,
    port: PORT,
    start,
    stop,
    services,
    nodeEnv: NODE_ENV,
    appVersion: APP_VERSION,
    get httpServer() {
      return httpServer;
    },
  };
}
