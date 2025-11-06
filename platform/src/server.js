/* eslint-disable import/order */
import express from "express";
import helmet from "helmet";
import compression from "compression";
import morgan from "morgan";
import cookieParser from "cookie-parser";
import { engine as hbsEngine } from "express-handlebars";
import fs from "fs/promises";
import path from "path";

import { buildPluginRoutes } from "$/ext-host/build-routes.js";

import { prisma } from "$/services/database.mjs";
import logger from "$/services/logger.mjs";

import secure from "$/middlewares/secure.mjs";
import { requireAuth, disallowIfAuthed } from "$/middlewares/auth.mjs";
import exposeGlobals from "$/middlewares/exposeGlobals.mjs";
import useJSX from "$/middlewares/useJSX.mjs";
import requireRole from "$/middlewares/requireRole.mjs";

import * as indexHandler from "$/handlers/index.mjs";
import * as authHandler from "$/handlers/auth/index.mjs";
import * as settingsHandler from "$/handlers/settings/index.mjs";
import * as appHandler from "$/handlers/app.mjs";

import apiProjects from "$/routes/api/projects.js";

import env from "$/config/env.mjs";

import "$/utils/hbsHelpers.mjs";

const config = env();
const { __publicdir, __templatedir, __datadir, PORT, NODE_ENV, IS_PROD, APP_VERSION } = config;

export default async function createServer(manifest) {
  const app = express();

  const { __assets, __views, __partials } = manifest;

  // Ensure data root exist at startup
  await fs.mkdir(__datadir, { recursive: true });

  // Vite is used for JSX/TSX SSR in dev (middleware mode)
  let createViteServer;
  if (!IS_PROD) {
    // Lazy require to avoid hard dependency in production builds
    ({ createServer: createViteServer } = await import("vite"));

    // --- Vite (dev) for JSX/TSX SSR ----
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
  app.use(useJSX);

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
  app.use(secure);

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
  app.set("view cache", IS_PROD);

  // Serve everything under /public at the root
  // TODO: Consider moving this into a small utility like utils/cacheHeaders.mjs
  // since we’ll likely reuse it for plugin assets.
  const staticOptions = {
    index: false,
    setHeaders: (res, filePath) => {
      if (IS_PROD) {
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

  await buildPluginRoutes(app, manifest, config);

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
