/* eslint-disable import/order */
import "dotenv/config";

import express from "express";
import helmet from "helmet";
import compression from "compression";
import morgan from "morgan";
import cookieParser from "cookie-parser";
import { engine as hbsEngine } from "express-handlebars";
import fs from "fs/promises";
import path from "path";

import authRouter from "$/routes/auth.mjs";
import apiRouter from "$/routes/api/index.mjs";
import webRouter from "$/routes/web.mjs";

import { secure } from "$/middlewares/security.mjs";
// import { requireFeature } from "$/middlewares/feature.mjs";
import { requireAuth, disallowIfAuthed } from "$/middlewares/auth.mjs";
import { exposeGlobals } from "$/middlewares/misc.mjs";
import { useJSX } from "$/middlewares/jsx.mjs";

import * as indexHandler from "$/handlers/index.mjs";
import * as authHandler from "$/handlers/auth/index.mjs";

import logger from "$/utils/logger.mjs";
global.logger = logger; // Make logger globally accessible (e.g., in Prisma hooks)

import { connectPrismaWithRetry, gracefulShutdown } from "./prisma.mjs";
import env from "./config/env.mjs";

const { __publicdir, __templatedir, __datadir, PORT, NODE_ENV } = env();

// Ensure data root exist at startup
await fs.mkdir(__datadir, { recursive: true });

// Connect to the database
await connectPrismaWithRetry();
// Handle termination signals to close DB connections gracefully
process.on("SIGINT", () => gracefulShutdown("SIGINT"));
process.on("SIGTERM", () => gracefulShutdown("SIGTERM"));

// Vite is used for JSX/TSX SSR in dev (middleware mode)
let createViteServer;
if (process.env.NODE_ENV !== "production") {
  // Lazy require to avoid hard dependency in production builds
  // eslint-disable-next-line n/no-unpublished-import
  ({ createServer: createViteServer } = await import("vite"));
}

// Bootstrap the app server
const app = express();

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
app.engine(
  "html",
  hbsEngine({
    extname: ".html",
    defaultLayout: false,
    partialsDir: path.join(__templatedir, "_partials"),
  }),
);
app.set("view engine", "html");
app.set("views", __templatedir);

// Enable template caching in production
app.set("view cache", NODE_ENV === "production");

// Serve everything under /public at the root
app.use(
  express.static(__publicdir, {
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
  }),
);

// Security headers
app.use(secure);

// TODO: Transform the API to mount based on file system (like Next.js API routes)
// This would make it easier to manage and scale the API surface.

// JSX/TSX SSR handler
app.use(useJSX);

// --- Demo routes ---
// Example route for React-SSR handled view (captures any subpath)
app.get(
  /^\/example\/react(?:\/(.*))?$/,
  requireAuth,
  exposeGlobals,
  async (req, res, next) => {
    try {
      const subpath = req.params[0] || "";
      await res.renderJSX("example/react/index", { path: subpath });
    } catch (e) {
      next(e);
    }
  },
);

app.get("/", requireAuth, exposeGlobals, indexHandler.viewIndex);
app.get("/login", disallowIfAuthed, authHandler.viewLogin);
app.post("/login", authHandler.login);
app.get("/register", disallowIfAuthed, authHandler.viewRegister);
app.post("/register", authHandler.register);
app.get("/logout", authHandler.logout);

app.use("/", webRouter);
app.use("/", authRouter);
app.use("/api", apiRouter);

// 404
app.use((req, res) => {
  if (req.path.startsWith("/api/"))
    return res.status(404).json({ error: "Not found" });
  return res.status(404).render("error", {
    code: 404,
    message: "Page not found",
    description: "The page you’re looking for doesn’t exist.",
  });
});

// Central error handler
app.use((err, req, res, next) => {
  logger.error(err);
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

// Start the server
app.listen(PORT, () => {
  logger.log(`Sovereign server running at http://localhost:${PORT}`);
});
