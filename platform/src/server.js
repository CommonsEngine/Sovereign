/* eslint-disable import/order */
import express from "express";
import helmet from "helmet";
import compression from "compression";
import morgan from "morgan";
import cookieParser from "cookie-parser";
import { engine as hbsEngine } from "express-handlebars";
import fs from "fs/promises";
import path from "path";
import { randomUUID } from "node:crypto";

import { buildPluginRoutes } from "$/ext-host/build-routes.js";

import { prisma } from "$/services/database.js";
import logger from "$/services/logger.js";
import createRealtimeHub from "$/ws/server.js";

import secure from "$/middlewares/secure.js";
import { requireAuth, disallowIfAuthed } from "$/middlewares/auth.js";
import exposeGlobals from "$/middlewares/exposeGlobals.js";
import useJSX from "$/middlewares/useJSX.js";
import rateLimiters from "$/middlewares/rateLimit.js";

import * as indexHandler from "$/handlers/index.js";
import * as authHandler from "$/handlers/auth/index.js";

import apiProjects from "$/routes/api/projects.js";
import apiInvites from "$/routes/api/invites.js";

import env from "$/config/env.js";

import { cleanupExpiredGuestUsers, GUEST_RETENTION_MS } from "$/utils/guestCleanup.js";

import "$/utils/hbsHelpers.js";

const config = env();
const { __publicdir, __templatedir, __datadir, PORT, NODE_ENV, IS_PROD, APP_VERSION } = config;
const GUEST_CLEANUP_INTERVAL_MS = GUEST_RETENTION_MS;

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
  app.set("trust proxy", 1);

  // For observability logs
  app.use((req, res, next) => {
    req.id = randomUUID();
    res.set("x-request-id", req.id);
    next();
  });

  // Core middleware
  // TODO: create a nonce per request, store on res.locals.cspNonce
  // set helmet contentSecurityPolicy with script-src 'nonce-<nonce>' 'strict-dynamic' https:
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
  // TODO: Consider moving this into a small utility like utils/cacheHeaders.js
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
  app.post("/auth/invite", requireAuth, rateLimiters.authedApi, authHandler.inviteUser);
  app.get("/auth/guest", rateLimiters.public, authHandler.guestLogin);
  app.get("/auth/me", requireAuth, authHandler.getCurrentUser);
  app.get("/auth/verify", authHandler.verifyToken); // Request /?token=...
  app.post("/auth/password/forgot", rateLimiters.public, authHandler.forgotPassword); // Request Body { email }
  app.post("/auth/password/reset", rateLimiters.public, authHandler.resetPassword); // Request Body { token, password }

  // Web Routes
  app.get("/", requireAuth, exposeGlobals, indexHandler.viewIndex);
  app.get("/login", disallowIfAuthed, exposeGlobals, authHandler.viewLogin);
  app.post("/login", rateLimiters.public, authHandler.login);
  app.get("/register", disallowIfAuthed, exposeGlobals, authHandler.viewRegister);
  app.post("/register", rateLimiters.public, authHandler.register);
  app.get("/logout", exposeGlobals, authHandler.logout);

  // Project Routes
  app.use("/api/projects", apiProjects);
  app.use("/api/invites", apiInvites);

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
  let guestCleanupTimer = null;
  let guestCleanupRunning = false;
  let realtimeHub = null;

  const runGuestCleanup = async (reason = "scheduled") => {
    if (guestCleanupRunning) return;
    guestCleanupRunning = true;
    try {
      const { cleaned } = await cleanupExpiredGuestUsers({
        logger,
        olderThanMs: GUEST_RETENTION_MS,
      });
      if (cleaned > 0) {
        logger.info(`✓ Guest cleanup (${reason}) removed ${cleaned} account(s)`);
      }
    } catch (err) {
      logger.error("✗ Guest cleanup run failed", err);
    } finally {
      guestCleanupRunning = false;
    }
  };

  const scheduleGuestCleanup = () => {
    if (guestCleanupTimer) clearInterval(guestCleanupTimer);
    guestCleanupTimer = setInterval(() => {
      runGuestCleanup("interval");
    }, GUEST_CLEANUP_INTERVAL_MS);
    guestCleanupTimer.unref?.();
  };

  async function start() {
    await new Promise((resolve) => {
      httpServer = app.listen(PORT, () => {
        logger.info(`  ➜  Server running at http://localhost:${PORT}`);
        resolve();
      });
    });
    if (config.REALTIME_ENABLED !== false) {
      realtimeHub = createRealtimeHub(httpServer, {
        logger,
        path: config.REALTIME_WS_PATH,
      });
      if (realtimeHub) {
        logger.info(`  ➜  Realtime hub listening on ${realtimeHub.path}`);
      }
    }
    scheduleGuestCleanup();
    runGuestCleanup("startup");
    return httpServer;
  }

  async function stop() {
    if (!httpServer) return;
    if (guestCleanupTimer) {
      clearInterval(guestCleanupTimer);
      guestCleanupTimer = null;
    }
    guestCleanupRunning = false;
    if (realtimeHub) {
      await realtimeHub.close();
      realtimeHub = null;
    }
    await new Promise((resolve) => httpServer.close(resolve));
  }

  const services = {
    app,
    logger,
    config,
    database: { prisma },
    get realtime() {
      return realtimeHub;
    },
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
