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

import secure from "$/middlewares/secure.mjs";
import { requireAuth, disallowIfAuthed } from "$/middlewares/auth.mjs";
import exposeGlobals from "$/middlewares/exposeGlobals.mjs";
import useJSX from "$/middlewares/useJSX.mjs";
import requireRole from "$/middlewares/requireRole.mjs";

import * as indexHandler from "$/handlers/index.mjs";
import * as authHandler from "$/handlers/auth/index.mjs";
import * as usersHandler from "$/handlers/users/index.mjs";
import * as settingsHandler from "$/handlers/settings/index.mjs";
import * as projectsHandler from "$/handlers/projects/index.mjs";
import * as projectSharesHandler from "$/handlers/projects/shares.mjs";
import * as appHandler from "$/handlers/app.mjs";

import hbsHelpers from "$/utils/hbsHelpers.mjs";

import env from "$/config/env.mjs";

const config = env();
const { __rootdir, __publicdir, __templatedir, __datadir, PORT, NODE_ENV, APP_VERSION } = config;

const EXTERNAL_URL_PATTERN = /^(?:[a-z]+:)?\/\//i;

const BLANK_RE = /^\s*$/;

function isExternalUrl(candidate) {
  if (!candidate) return false;
  return EXTERNAL_URL_PATTERN.test(candidate) || candidate.startsWith("/");
}

function resolvePluginAsset(namespace, assetPath) {
  if (!assetPath) return assetPath;
  if (isExternalUrl(assetPath)) return assetPath;
  return `/plugins/${namespace}/${assetPath.replace(/^\.\//, "")}`;
}

function unique(items) {
  return [...new Set(items.filter(Boolean))];
}

function extractPluginSections(markup, namespace) {
  const headMatch = markup.match(/<head[^>]*>([\s\S]*?)<\/head>/i);
  const bodyMatch = markup.match(/<body[^>]*>([\s\S]*?)<\/body>/i);

  let headContent = headMatch ? headMatch[1].trim() : "";
  let bodyContent = bodyMatch ? bodyMatch[1].trim() : markup.trim();

  const styles = [];
  headContent = headContent.replace(/<link\b[^>]*rel=["']stylesheet["'][^>]*>/gi, (tag) => {
    const hrefMatch = tag.match(/\bhref=["']([^"']+)["']/i);
    if (hrefMatch) styles.push(resolvePluginAsset(namespace, hrefMatch[1]));
    return "";
  });

  const externalScripts = [];
  const inlineScripts = [];

  const stripScripts = (source) =>
    source.replace(/<script\b[^>]*>([\s\S]*?)<\/script>/gi, (tag, inline = "") => {
      const srcMatch = tag.match(/\bsrc=["']([^"']+)["']/i);
      if (srcMatch) {
        externalScripts.push(resolvePluginAsset(namespace, srcMatch[1]));
      } else if (!BLANK_RE.test(inline)) {
        inlineScripts.push(inline.trim());
      }
      return "";
    });

  headContent = stripScripts(headContent);
  bodyContent = stripScripts(bodyContent);

  headContent = headContent
    .replace(/<!doctype[\s\S]*?>/gi, "")
    .replace(/<title[\s\S]*?<\/title>/gi, "")
    .replace(/<meta[^>]+charset[^>]*>/gi, "")
    .replace(/<meta[^>]+viewport[^>]*>/gi, "");

  return {
    pluginHead: headContent.trim(),
    pluginMarkup: bodyContent.trim(),
    styles: unique(styles),
    scripts: unique(externalScripts),
    inlineScripts,
  };
}

async function pathExists(targetPath) {
  try {
    await fs.access(targetPath);
    return true;
  } catch (err) {
    if (err?.code === "ENOENT") return false;
    throw err;
  }
}

export default async function createServer({ plugins, usePluginsGlobals }) {
  const app = express();

  async function renderPluginTemplate(viewPath, locals) {
    return new Promise((resolve, reject) => {
      app.render(
        viewPath,
        {
          layout: false,
          ...locals,
        },
        (err, html) => {
          if (err) return reject(err);
          resolve(html);
        }
      );
    });
  }

  // Ensure data root exist at startup
  await fs.mkdir(__datadir, { recursive: true });

  // Vite is used for JSX/TSX SSR in dev (middleware mode)
  let createViteServer;
  if (process.env.NODE_ENV !== "production") {
    // Lazy require to avoid hard dependency in production builds
    ({ createServer: createViteServer } = await import("vite"));
  }

  // --- Vite (dev) for JSX/TSX SSR ----
  if (NODE_ENV !== "production") {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "custom",
    });
    app.locals.vite = vite;
    app.use(vite.middlewares);
  }

  // Trust proxy (needed if running behind reverse proxy to set secure cookies properly)
  app.set("trust proxy", 1);

  // Core middleware
  app.use(helmet());
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
      partialsDir: path.join(__templatedir, "_partials"),
      helpers: hbsHelpers,
    })
  );
  app.set("view engine", "html");
  app.set("views", __templatedir);

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
  app.use(express.static(path.join(__rootdir, "plugins", "example-plugin-react", "public"), staticOptions));
  app.use(express.static(path.join(__rootdir, "plugins", "example-plugin-react", "dist", "assets"), staticOptions));

  if (plugins && Object.keys(plugins).length) {
    for (const [namespace, pluginDef] of Object.entries(plugins)) {
      if (!pluginDef?.plugingRoot) continue;

      if (pluginDef.type === "react") {
        const distDir = path.join(pluginDef.plugingRoot, "dist");
        if (await pathExists(distDir)) {
          app.use(`/plugins/${namespace}`, express.static(distDir, staticOptions));
        }
        continue;
      }

      const publicDir = path.join(pluginDef.plugingRoot, "public");
      if (await pathExists(publicDir)) {
        app.use(`/plugins/${namespace}`, express.static(publicDir, staticOptions));
      }
    }
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

  // --- Demo routes ---
  // Example route for React-SSR handled view (captures any subpath)
  app.get(/^\/example\/react(?:\/(.*))?$/, requireAuth, exposeGlobals, async (req, res, next) => {
    try {
      const subpath = req.params[0] || "";
      await res.renderJSX("example/react/index", { path: subpath });
    } catch (e) {
      next(e);
    }
  }); // TODO: Remove once the platfrom is ready

  // Auth Routes
  app.post("/auth/invite", requireAuth, authHandler.inviteUser);
  app.get("/auth/guest", authHandler.guestLogin);
  app.get("/auth/me", requireAuth, authHandler.getCurrentUser);
  app.get("/auth/verify", authHandler.verifyToken); // Request /?token=...
  app.post("/auth/password/forgot", authHandler.forgotPassword); // Request Body { email }
  app.post("/auth/password/reset", authHandler.resetPassword); // Request Body { token, password }

  // Web Routes
  app.get("/", requireAuth, exposeGlobals, usePluginsGlobals, indexHandler.viewIndex);
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

  // Project Routes (API)
  app.post("/api/projects", requireAuth, projectsHandler.create);
  app.get("/api/projects", requireAuth, projectsHandler.getAll);
  app.patch("/api/projects/:id", requireAuth, projectsHandler.update);
  app.delete("/api/projects/:id", requireAuth, projectsHandler.remove);
  app.get("/api/projects/:id/shares", requireAuth, projectSharesHandler.list);
  app.post("/api/projects/:id/shares", requireAuth, projectSharesHandler.create);
  app.patch("/api/projects/:id/shares/:memberId", requireAuth, projectSharesHandler.update);
  app.delete("/api/projects/:id/shares/:memberId", requireAuth, projectSharesHandler.remove);

  app.get("/p/:projectId", requireAuth, exposeGlobals, usePluginsGlobals, async (req, res) => {
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

      // Fetch Project with metadata for shell + plugin bootstrapping
      const project = await prisma.project.findUnique({
        where: { id: projectId },
        select: {
          id: true,
          type: true,
          name: true,
          status: true,
        },
      });

      if (!project) {
        return res.status(404).render("error", {
          code: 404,
          message: "Project not found",
          description: "We couldn't locate this project.",
        });
      }

      const namespace = project.type;
      const plugin = plugins?.[namespace];

      if (!plugin) {
        return res.status(404).render("error", {
          code: 404,
          message: "Plugin unavailable",
          description: "This project is linked to a plugin that is not installed.",
        });
      }

      const platformTitle = res.locals?.head?.title || "Sovereign";
      const pageTitle = plugin.name || project.name || namespace;

      res.locals.head = {
        ...res.locals.head,
        title: `${pageTitle} · ${platformTitle}`,
        link: unique([
          ...(res.locals.head?.link || []),
          { rel: "canonical", href: `/p/${projectId}` },
        ]),
      };

      const baseStyles = [
        "/css/components/sidebar.css",
        "/css/components/userbar.css",
        "/css/components/card.css",
        "/css/components/modal.css",
        "/css/components/breadcrumb.css",
        "/example-plugin-react.css"
      ];

      const shellModel = {
        layout: false,
        head: res.locals.head,
        page: {
          title: pageTitle,
        },
        pluginMarkup: "",
        pluginHead: "",
        styles: baseStyles,
        scripts: [],
        inlineScripts: "",
      };

      const inlineScriptBlocks = [];

      if (plugin.type === "html") {
        try {
          const renderedPlugin = await renderPluginTemplate(plugin.entry, {
            project,
            plugin,
            user: req.user,
          });
          const extracted = extractPluginSections(renderedPlugin, namespace);
          shellModel.pluginMarkup = extracted.pluginMarkup;
          shellModel.pluginHead = extracted.pluginHead;
          shellModel.styles = unique([...shellModel.styles, ...extracted.styles]);
          shellModel.scripts = unique([...shellModel.scripts, ...extracted.scripts]);
          if (extracted.inlineScripts.length) {
            inlineScriptBlocks.push(
              ...extracted.inlineScripts.map((code) => `<script>${code}</script>`)
            );
          }
        } catch (renderErr) {
          logger.error("✗ Failed to render HTML plugin template:", renderErr);
          shellModel.pluginMarkup =
            '<section class="card card--error"><p>Failed to render plugin template.</p></section>';
        }
      } else if (plugin.type === "react") {
        const entryBasename = path.basename(plugin.entry);
        const entryUrl = resolvePluginAsset(namespace, entryBasename);
        shellModel.scripts = unique([...shellModel.scripts, entryUrl]);

        const resolvedNodeEnv = JSON.stringify(NODE_ENV || "production");
        inlineScriptBlocks.push(
          `<script>(function(){const g=globalThis;g.global ||= g;g.process ||= { env: {} };g.process.env ||= {};if(!g.process.env.NODE_ENV) g.process.env.NODE_ENV = ${resolvedNodeEnv};})();</script>`
        );

        const distDir = path.join(plugin.plugingRoot, "dist");
        if (await pathExists(distDir)) {
          try {
            const assets = await fs.readdir(distDir);
            const cssAssets = assets.filter((file) => file.endsWith(".css"));
            if (cssAssets.length) {
              const cssHrefs = cssAssets.map((file) => resolvePluginAsset(namespace, file));
              shellModel.styles = unique([...shellModel.styles, ...cssHrefs]);
              inlineScriptBlocks.push(
                `<script>(function(){const head=document.head;const styles=${JSON.stringify(
                  cssHrefs
                )};styles.forEach((href)=>{if(!head.querySelector('link[data-plugin-style="${namespace}"][href="' + href + '"]')){const link=document.createElement('link');link.rel='stylesheet';link.href=href;link.dataset.pluginStyle='${namespace}';head.appendChild(link);}});})();</script>`
              );
            }
          } catch (assetErr) {
            logger.warn(`Unable to read built assets for plugin "${namespace}"`, assetErr);
          }
        }
      } else {
        shellModel.pluginMarkup =
          '<section class="card card--warning"><p>This plugin type is not supported yet.</p></section>';
      }

      const bootContext = {
        plugin: {
          id: plugin.id,
          name: plugin.name,
          namespace,
          type: plugin.type,
          version: plugin.version,
        },
        project: {
          id: project.id,
          name: project.name,
          type: project.type,
          status: project.status,
        },
      };

      inlineScriptBlocks.push(
        `<script>window.Sovereign ??= {}; window.Sovereign.pluginContext = ${JSON.stringify(
          bootContext
        )};</script>`
      );

      shellModel.inlineScripts = inlineScriptBlocks.join("\n");
      shellModel.styles = unique(shellModel.styles);
      shellModel.scripts = unique(shellModel.scripts);

      logger.debug(
        {
          namespace,
          pluginScripts: shellModel.scripts,
          pluginStyles: shellModel.styles,
          pluginHead: shellModel.pluginHead?.length,
        },
        "Serving plugin shell"
      );

      return res.render("layouts/index", shellModel);
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

  // TODO: Plugins routes

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
