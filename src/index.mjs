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

import { connectPrismaWithRetry, gracefulShutdown } from "./prisma.mjs";
import { secure } from "./middlewares/security.mjs";
import {
  requireAuth,
  requireAuthWeb,
  disallowIfAuthed,
} from "./middlewares/auth.mjs";
import * as viewHandler from "./handlers/view.mjs";
import * as authHandler from "./handlers/auth.mjs";
import * as projectHandler from "./handlers/project.mjs";
import { __publicdir, __templatedir, __datadir } from "./config.mjs";

// Ensure data root exist at startup
await fs.mkdir(__datadir, { recursive: true });

await connectPrismaWithRetry();
process.on("SIGINT", () => gracefulShutdown("SIGINT"));
process.on("SIGTERM", () => gracefulShutdown("SIGTERM"));

// Bootstrap the app server
const app = express();

// Trust proxy (needed if running behind reverse proxy to set secure cookies properly)
app.set("trust proxy", 1);

// Core middleware
app.use(helmet());
app.use(compression());
app.use(morgan(process.env.NODE_ENV === "production" ? "combined" : "dev"));
app.use(express.json({ limit: "1mb" }));
app.use(express.urlencoded({ extended: true }));
app.use(cookieParser());

// View engine
app.engine(
  "html",
  hbsEngine({
    extname: ".html",
    defaultLayout: false,
    partialsDir: path.join(__templatedir, "partials"),
  }),
);
app.set("view engine", "html");
app.set("views", __templatedir);

// Static: only expose assets and css (not the html templates)
app.use(
  "/assets",
  express.static(path.join(__publicdir, "assets"), { index: false }),
);
app.use(
  "/css",
  express.static(path.join(__publicdir, "css"), { index: false }),
);

// Security headers
app.use(secure);

// Block direct access to template files under /public (e.g., *.html, *.hbs)
app.use((req, res, next) => {
  if (/\.(html|hbs)$/i.test(req.path)) {
    return res.status(404).render("error", {
      code: 404,
      message: "Page not found",
      description:
        "The page you’re looking for doesn’t exist or may have been moved.",
    });
  }
  next();
});

// View Routes
app.get("/", requireAuthWeb, viewHandler.viewIndexPage);
app.get("/login", disallowIfAuthed, viewHandler.viewLoginPage);
app.get("/register", disallowIfAuthed, viewHandler.viewRegisterPage);
app.get("/logout", authHandler.logout);
app.get("/p/:id", requireAuthWeb, viewHandler.viewProjectPage);
app.get("/p/:projectId/post/:postId", requireAuthWeb, viewHandler.viewPostPage);
app.get("/users", requireAuthWeb, viewHandler.viewUsersPage);
app.get("/settings", requireAuthWeb, viewHandler.viewSettingsPage);

// Auth Routes
app.post("/auth/register", authHandler.register);
app.post("/auth/login", authHandler.login);
app.get("/auth/guest", authHandler.guestLogin);
app.post("/auth/logout", authHandler.logout);
app.get("/auth/me", requireAuth, authHandler.getCurrentUser);
app.get("/auth/verify", authHandler.verifyToken); // Request /?token=...
app.post("/auth/password/forgot", authHandler.forgotPassword); // Request Body { email }
app.post("/auth/password/reset", authHandler.resetPassword); // Request Body { token, password }

// Project Routes
app.post("/api/project", requireAuth, projectHandler.createProject);
app.delete("/api/project/:id", requireAuth, projectHandler.deleteProject);

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
  console.error(err);
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

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`Sovereign server running at http://localhost:${PORT}`);
});
