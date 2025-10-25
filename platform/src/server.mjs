/* eslint-disable import/order */
import express from "express";
import helmet from "helmet";
import compression from "compression";
import morgan from "morgan";
import cookieParser from "cookie-parser";
import { engine as hbsEngine } from "express-handlebars";
import fs from "fs/promises";
import path from "path";

import { prisma } from "$/services/database.mjs";
import logger from "$/services/logger.mjs";

import secure from "$/platform/middlewares/secure.mjs";
import { requireAuth, disallowIfAuthed } from "$/platform/middlewares/auth.mjs";
import exposeGlobals from "$/platform/middlewares/exposeGlobals.mjs";
import useJSX from "$/platform/middlewares/useJSX.mjs";
import requireRole from "$/platform/middlewares/requireRole.mjs";

import * as indexHandler from "$/platform/handlers/index.mjs";
import * as authHandler from "$/platform/handlers/auth/index.mjs";
import * as usersHandler from "$/platform/handlers/users/index.mjs";
import * as settingsHandler from "$/platform/handlers/settings/index.mjs";
import * as projectsHandler from "$/platform/handlers/projects/index.mjs";
import * as projectSharesHandler from "$/platform/handlers/projects/shares.mjs";
import * as appHandler from "$/platform/handlers/app.mjs";

import hbsHelpers from "$/utils/hbsHelpers.mjs";

import env from "$/config/env.mjs";

const config = env();
const { __publicdir, __runtimeDir, __templatedir, __datadir, PORT, NODE_ENV, APP_VERSION } = config;

// Ensure data root exist at startup
await fs.mkdir(__datadir, { recursive: true });

// Vite is used for JSX/TSX SSR in dev (middleware mode)
let createViteServer;
if (process.env.NODE_ENV !== "production") {
  // Lazy require to avoid hard dependency in production builds
  ({ createServer: createViteServer } = await import("vite"));
}

export default async function createServer({ plugins }) {
  const app = express();

  const templateDirs = [__templatedir];
  const publicDirs = [];
  const uploadDirs = [];

  const pluginsMap = new Map();

  const webRouters = [];
  const apiRouters = [];

  // plugins: mounting
  /** TODO:
   * To future-proof, consider separating the plugin discovery layer (manifest reading, module import, normalization)
   * into a helper (e.g., /platform/ext-host/loader.mjs). That keeps server.mjs focused only on mounting.
   */

  for (const p of plugins || []) {
    const namespace = p.namespace;

    pluginsMap.set(namespace, path.join(__runtimeDir, `plugins/${namespace}/index.mjs`));

    // Directories
    templateDirs.push(path.join(__runtimeDir, `plugins/${namespace}/views`));

    publicDirs.push({
      namespace,
      path: path.join(__runtimeDir, `plugins/${namespace}/public`),
    });

    if (p?.platformCapabilities?.fileUpload) {
      uploadDirs.push({
        namespace,
        path: path.resolve(path.join(process.cwd(), "data", namespace)),
      });
    }

    // Routes
    // TODO: Parallelize imports to avoid performance issues
    // - await Promise.all(plugins.map(async p => { ... }))
    // TODO: Consider implementing capability for auto-detect route files
    if (p?.routes?.web) {
      webRouters.push({
        base: `/${namespace}`,
        router: await import(path.join(__runtimeDir, "plugins", namespace, "routes", "web.mjs")),
      });
    }
    if (p?.routes?.api) {
      apiRouters.push({
        base: `/api/${namespace}`,
        router: await import(path.join(__runtimeDir, `plugins/${namespace}/routes/api.mjs`)),
      });
    }
  }

  // Trust proxy (needed if running behind reverse proxy to set secure cookies properly)
  app.set("trust proxy", 1);

  // --- Vite (dev) for JSX/TSX SSR ----
  if (NODE_ENV !== "production") {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "custom",
    });
    app.locals.vite = vite;
    app.use(vite.middlewares);
  }

  // Core middleware
  app.use(helmet());
  app.use(compression());
  app.use(morgan(NODE_ENV === "production" ? "combined" : "dev"));
  app.use(express.json({ limit: "1mb" }));
  app.use(express.urlencoded({ extended: true }));
  app.use(cookieParser());

  app.use(useJSX);

  // View engine
  // TODO: Consider letting each plugin also register its own partials:
  // app.engine("html", hbsEngine({ partialsDir: templateDirs.map(d => path.join(d, "_partials")), ... }))
  app.engine(
    "html",
    hbsEngine({
      extname: ".html",
      defaultLayout: false,
      partialsDir: path.join(__templatedir, "_partials"),
      helpers: hbsHelpers,
    })
  );
  app.set("view engine", "html");
  app.set("views", templateDirs);

  // Enable template caching in production
  app.set("view cache", NODE_ENV === "production");

  // Serve everything under /public at the root
  // TODO: Consider moving it into a small utility like utils/cacheHeaders.mjs
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

  publicDirs.forEach(({ namespace, path }) => {
    app.use(`/plugins/${namespace}`, express.static(path, staticOptions));
  });

  const uploadConfigs = uploadDirs.map(({ path }) =>
    express.static(path, {
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
  app.use("/uploads", uploadConfigs);

  // Security headers
  app.use(secure);

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

  // Project Routes (Web)
  app.get("/p/:projectId", requireAuth, exposeGlobals, async (req, res) => {
    try {
      const projectId = req.params.projectId;
      if (!projectId) {
        return res.status(400).render("error", {
          code: 400,
          message: "Bad Request",
          description: "Missing project id",
        });
      }

      // Resolve ownership
      // TODO: Fix the query by quering by role (all allowed roles)
      const projectContributions = await prisma.projectContributor.findFirst({
        where: { projectId, userId: req.user.id, status: "active" },
        select: { role: true },
      });

      if (!["owner", "editor", "admin"].includes(projectContributions?.role)) {
        return res.status(403).render("error", {
          code: 403,
          message: "Forbidden",
          description: "You are not authorized!",
        });
      }

      // Fetch Project
      const project = await prisma.project.findUnique({
        where: { id: projectId },
        select: { id: true, type: true },
      });

      // TODO: Instead of importing pluginRoot every request, cache it:
      // const pluginRoot = pluginsCache.get(project.type) || await import(...);
      const pluginPath = pluginsMap.get(project.type);
      const pluginRoot = await import(pluginPath);
      // TODO: We should pass project, other required services as the context
      return pluginRoot.render({}, (resolve) => {
        return resolve(req, res);
      });
    } catch (err) {
      logger.error("✗ Render project page failed:", err);
      return res.status(500).render("error", {
        code: 500,
        message: "Oops!",
        description: "Failed to load project",
        error: err?.message || String(err),
      });
    }
  });

  // Project Routes (API)
  app.post("/api/projects", requireAuth, projectsHandler.create);
  app.get("/api/projects", requireAuth, projectsHandler.getAll);
  app.patch("/api/projects/:id", requireAuth, projectsHandler.update);
  app.delete("/api/projects/:id", requireAuth, projectsHandler.remove);
  app.get("/api/projects/:id/shares", requireAuth, projectSharesHandler.list);
  app.post("/api/projects/:id/shares", requireAuth, projectSharesHandler.create);
  app.patch("/api/projects/:id/shares/:memberId", requireAuth, projectSharesHandler.update);
  app.delete("/api/projects/:id/shares/:memberId", requireAuth, projectSharesHandler.remove);

  // Plugins Routes (Web)
  for (const { base, router } of webRouters) {
    app.use(base, requireAuth, exposeGlobals, router.default);
  }
  // Plugins Routes (API)
  for (const { base, router } of apiRouters) {
    app.use(base, requireAuth, router.default);
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
