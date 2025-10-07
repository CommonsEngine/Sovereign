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

import { secure } from "./middlewares/security.mjs";
import { requireFeature } from "./middlewares/feature.mjs";
import {
  requireAuth,
  requireAuthWeb,
  disallowIfAuthed,
} from "./middlewares/auth.mjs";
import { requireRole, exposeRoleFlags } from "./middlewares/user.mjs";

import * as authHandler from "./handlers/auth.mjs";
import * as viewHandler from "./handlers/view/index.mjs";
import * as projectHandler from "./handlers/project/index.mjs";

import logger from "./utils/logger.mjs";
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

// Bootstrap the app server
const app = express();

// Trust proxy (needed if running behind reverse proxy to set secure cookies properly)
app.set("trust proxy", 1);

// Core middleware
app.use(helmet());
app.use(compression());
app.use(morgan(NODE_ENV === "production" ? "combined" : "dev"));
app.use(express.json({ limit: "1mb" }));
app.use(express.urlencoded({ extended: true }));
app.use(cookieParser());

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

// Auth Routes
app.post("/auth/register", authHandler.register);
app.post(
  "/auth/invite",
  requireAuth,
  requireRole(["owner", "admin"]),
  authHandler.invite,
);
app.post("/auth/login", authHandler.login);
app.get("/auth/guest", authHandler.guestLogin);
app.post("/auth/logout", authHandler.logout);
app.get("/auth/me", requireAuth, authHandler.getCurrentUser);
app.get("/auth/verify", authHandler.verifyToken); // Request /?token=...
app.post("/auth/password/forgot", authHandler.forgotPassword); // Request Body { email }
app.post("/auth/password/reset", authHandler.resetPassword); // Request Body { token, password }

// Web Routes
app.get("/", requireAuthWeb, exposeRoleFlags, viewHandler.index);
app.get("/login", disallowIfAuthed, viewHandler.login);
app.get("/register", disallowIfAuthed, viewHandler.register);
app.get("/logout", authHandler.logout);

app.get(
  "/users",
  requireAuthWeb,
  requireRole(["owner", "admin"]),
  exposeRoleFlags,
  viewHandler.users,
);
app.get(
  "/settings",
  requireAuthWeb,
  requireRole(["owner", "admin"]),
  exposeRoleFlags,
  viewHandler.settings,
);

app.get("/p/:projectId", requireAuthWeb, exposeRoleFlags, viewHandler.project);
app.get(
  "/p/:projectId/configure",
  requireAuthWeb,
  exposeRoleFlags,
  viewHandler.projectConfigure,
);

// Web Routes :: Project/GitCMS
app.get(
  "/p/:projectId/gitcms/post/new",
  requireFeature("gitcms"),
  requireAuthWeb,
  exposeRoleFlags,
  viewHandler.gitcms.postCreate,
);
app.get(
  "/p/:projectId/gitcms/post/:fp",
  requireAuthWeb,
  exposeRoleFlags,
  viewHandler.gitcms.postView,
);

// API Routes :: Project
app.post("/api/project", requireAuth, projectHandler.create);
app.patch("/api/project/:id", requireAuth, projectHandler.update);
app.delete("/api/project/:id", requireAuth, projectHandler.remove);

// TODO: Move project-specific APIs to /routes/*

// API Routes :: Project/GitCMS
app.post(
  "/api/project/:projectId/gitcms/configure",
  requireFeature("gitcms"),
  requireAuth,
  projectHandler.gitcms.configure,
);
app.get(
  "/api/project/:projectId/gitcms/post/all",
  requireFeature("gitcms"),
  requireAuth,
  projectHandler.gitcms.getPosts,
);
app.patch(
  "/api/project/:projectId/gitcms/post/:fp",
  requireFeature("gitcms"),
  requireAuth,
  projectHandler.gitcms.updatePost,
);
app.post(
  "/api/project/:projectId/gitcms/post/:fp",
  requireFeature("gitcms"),
  requireAuth,
  projectHandler.gitcms.publishPost,
);
app.delete(
  "/api/project/:projectId/gitcms/post/:fp",
  requireFeature("gitcms"),
  requireAuth,
  projectHandler.gitcms.deletePost,
);

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
