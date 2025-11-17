/* eslint-disable no-useless-escape */
import path from "node:path";
import fs from "fs/promises";

import logger from "$/services/logger.js";
import { prisma } from "$/services/database.js";
import { resolveSpaDevServer } from "$/utils/pluginDevServer.js";

const EXTERNAL_URL_PATTERN = /^(?:[a-z]+:)?\/\//i;
const pluginHeaderTemplateCache = new Map(); // path -> string|null

// const BLANK_RE = /^\s*$/;

function isExternalUrl(candidate) {
  if (!candidate) return false;
  return EXTERNAL_URL_PATTERN.test(candidate) || candidate.startsWith("/");
}

function resolvePluginAsset(namespace, assetPath) {
  if (!assetPath) return assetPath;
  if (isExternalUrl(assetPath)) return assetPath;
  const cleaned = assetPath.replace(/^\.\//, "").replace(/\\/g, "/");
  return `/plugins/${namespace}/${cleaned}`;
}

function unique(items) {
  return [...new Set(items.filter(Boolean))];
}

function setDevServerCsp(res, origin) {
  if (!origin) return;
  let wsOrigin = null;
  try {
    const url = new URL(origin);
    wsOrigin = `${url.protocol === "https:" ? "wss" : "ws"}://${url.host}`;
  } catch {
    wsOrigin = null;
  }
  const connectSources = [`'self'`, origin];
  if (wsOrigin) connectSources.push(wsOrigin);
  const directives = [
    `default-src 'self' ${origin}`,
    `script-src 'self' 'unsafe-inline' 'unsafe-eval' ${origin}`,
    `style-src 'self' 'unsafe-inline' ${origin}`,
    `img-src 'self' ${origin} data:`,
    `font-src 'self' ${origin} data:`,
    `connect-src ${connectSources.join(" ")}`,
  ];
  res.set("Content-Security-Policy", directives.join("; "));
}

function buildReactRefreshPreamble(origin) {
  if (!origin) return "";
  const refreshUrl = new URL("/@react-refresh", origin).toString();
  return `<script type="module">
import RefreshRuntime from "${refreshUrl}";
RefreshRuntime.injectIntoGlobalHook(window);
window.$RefreshReg$ = () => {};
window.$RefreshSig$ = () => (type) => type;
window.__vite_plugin_react_preamble_installed__ = true;
</script>`;
}

async function collectCssAssets(distDir) {
  const results = [];
  async function walk(currentDir, relPrefix = "") {
    let entries;
    try {
      entries = await fs.readdir(currentDir, { withFileTypes: true });
    } catch {
      return;
    }
    for (const entry of entries) {
      const relPath = relPrefix ? `${relPrefix}/${entry.name}` : entry.name;
      if (entry.isDirectory()) {
        await walk(path.join(currentDir, entry.name), relPath);
      } else if (entry.isFile() && entry.name.endsWith(".css")) {
        results.push(relPath);
      }
    }
  }
  await walk(distDir);
  return results;
}

async function loadPluginHeaderTemplate(namespace, pluginRoot) {
  if (!pluginRoot || !namespace) return null;
  const partialPath = path.join(pluginRoot, "_partials", `${namespace}-header.html`);
  if (pluginHeaderTemplateCache.has(partialPath)) {
    return pluginHeaderTemplateCache.get(partialPath);
  }
  try {
    const contents = await fs.readFile(partialPath, "utf8");
    pluginHeaderTemplateCache.set(partialPath, contents);
    return contents;
  } catch {
    pluginHeaderTemplateCache.set(partialPath, null);
    return null;
  }
}

function renderPluginHeader(template, context = {}) {
  if (!template) return null;
  const shareBtn = context?.share?.canView
    ? `<button type="button" class="chip button button--primary" data-modal-open="share-project" data-share-trigger>Share</button>`
    : "";
  const replacements = {
    "project.name": context?.project?.name || "",
    "project.id": context?.project?.id || "",
    "plugin.name": context?.plugin?.name || "",
    "plugin.namespace": context?.plugin?.namespace || "",
    "share.button": shareBtn,
  };
  let output = template;
  Object.entries(replacements).forEach(([key, value]) => {
    const re = new RegExp(`\\{\\{\\s*${key.replace(".", "\\.")}\\s*\\}\\}`, "g");
    output = output.replace(re, value);
  });
  return output;
}

// TODO: Keep this commented.
// function extractPluginSections(markup, namespace) {
//   const headMatch = markup.match(/<head[^>]*>([\s\S]*?)<\/head>/i);
//   const bodyMatch = markup.match(/<body[^>]*>([\s\S]*?)<\/body>/i);

//   let headContent = headMatch ? headMatch[1].trim() : "";
//   let bodyContent = bodyMatch ? bodyMatch[1].trim() : markup.trim();

//   const styles = [];
//   headContent = headContent.replace(/<link\b[^>]*rel=["']stylesheet["'][^>]*>/gi, (tag) => {
//     const hrefMatch = tag.match(/\bhref=["']([^"']+)["']/i);
//     if (hrefMatch) styles.push(resolvePluginAsset(namespace, hrefMatch[1]));
//     return "";
//   });

//   const externalScripts = [];
//   const inlineScripts = [];

//   const stripScripts = (source) =>
//     source.replace(/<script\b[^>]*>([\s\S]*?)<\/script>/gi, (tag, inline = "") => {
//       const srcMatch = tag.match(/\bsrc=["']([^"']+)["']/i);
//       if (srcMatch) {
//         externalScripts.push(resolvePluginAsset(namespace, srcMatch[1]));
//       } else if (!BLANK_RE.test(inline)) {
//         inlineScripts.push(inline.trim());
//       }
//       return "";
//     });

//   headContent = stripScripts(headContent);
//   bodyContent = stripScripts(bodyContent);

//   headContent = headContent
//     .replace(/<!doctype[\s\S]*?>/gi, "")
//     .replace(/<title[\s\S]*?<\/title>/gi, "")
//     .replace(/<meta[^>]+charset[^>]*>/gi, "")
//     .replace(/<meta[^>]+viewport[^>]*>/gi, "");

//   return {
//     pluginHead: headContent.trim(),
//     pluginMarkup: bodyContent.trim(),
//     styles: unique(styles),
//     scripts: unique(externalScripts),
//     inlineScripts,
//   };
// }

async function pathExists(targetPath) {
  try {
    await fs.access(targetPath);
    return true;
  } catch (err) {
    if (err?.code === "ENOENT") return false;
    throw err;
  }
}

export async function renderSPAModule(req, res, _, { plugin }) {
  const { namespace } = plugin;
  try {
    const entryPoint = plugin?.entryPoints?.web || null;
    const pluginRoot = path.join(process.env.PLUGINS_DIR, namespace);
    const pluginHeaderTemplate = await loadPluginHeaderTemplate(namespace, pluginRoot);
    const pluginHeader = renderPluginHeader(pluginHeaderTemplate, { plugin });
    const pluginShare = null;

    // TODO: Override res.locals.head for html document meta
    const baseStyles = [];

    const shellModel = {
      layout: false,
      head: res.locals.head,
      pluginMarkup: "",
      pluginHead: "",
      pluginHeader,
      pluginShare,
      styles: baseStyles,
      scripts: [],
      inlineScripts: "",
    };
    const inlineScriptBlocks = [];

    // Add plugin base stylesheet
    baseStyles.push(`/${namespace}.css`);

    const resolvedNodeEnv = JSON.stringify(process.env.NODE_ENV || "production");
    inlineScriptBlocks.push(
      `<script>(function(){const g=globalThis;g.global ||= g;g.process ||= { env: {} };g.process.env ||= {};if(!g.process.env.NODE_ENV) g.process.env.NODE_ENV = ${resolvedNodeEnv};})();</script>`
    );

    const devServer = await resolveSpaDevServer(plugin, namespace);
    const devScriptTags = [];

    if (devServer) {
      setDevServerCsp(res, devServer.origin);
      const clientUrl = new URL(devServer.client, devServer.origin).toString();
      const entryUrl = new URL(devServer.entry, devServer.origin).toString();
      devScriptTags.push(
        `<script type="module" src="${clientUrl}" data-plugin-dev-client="${namespace}"></script>`
      );
      const preamble = buildReactRefreshPreamble(devServer.origin);
      if (preamble) {
        devScriptTags.push(preamble);
      }
      devScriptTags.push(`<script type="module">import("${entryUrl}");</script>`);
    } else {
      if (!entryPoint) {
        return res.status(500).render("error", {
          code: 500,
          message: "Plugin Misconfigured",
          description: `Plugin "${namespace}" is missing a web entry point.`,
        });
      }

      const entryBasename = path.basename(entryPoint);
      const entryUrl = resolvePluginAsset(namespace, entryBasename);
      shellModel.scripts = unique([...shellModel.scripts, entryUrl]);

      const distDir = path.join(pluginRoot, "dist");
      if (await pathExists(distDir)) {
        try {
          const cssAssets = await collectCssAssets(distDir);
          if (cssAssets.length) {
            const cssHrefs = cssAssets.map((file) => resolvePluginAsset(namespace, file));
            shellModel.styles = unique([...shellModel.styles, ...cssHrefs]);
            inlineScriptBlocks.push(
              `<script>(function(){const head=document.head;const styles=${JSON.stringify(
                cssHrefs
              )};styles.forEach((href)=>{if(!head.querySelector('link[data-plugin-style="${namespace}"][href="' + href + '"]')){const link=document.createElement('link');link.rel='stylesheet';link.href=href;link.dataset.pluginStyle='${namespace}';head.appendChild(link);}});})();</script>`
            );
          }
        } catch (err) {
          logger.warn(`Unable to read built assets for plugin "${namespace}"`, err);
        }
      } else {
        return res.status(404).render("error", {
          code: 404,
          message: "Unsupported Plugin Type or JSX Markup",
          description: `${plugin?.framework} plugin framework is not supported yet.`,
        });
      }
    }

    // Rendering the plugin ---
    // Prepare the boot context
    const bootContext = {
      plugin: {
        id: plugin.id,
        name: plugin.name,
        namespace,
        framework: plugin.framework,
        version: plugin.version,
      },
    };

    inlineScriptBlocks.push(
      `<script>window.__sv ??= {}; window.__sv.context = ${JSON.stringify(bootContext)};</script>`
    );
    if (devScriptTags.length) {
      inlineScriptBlocks.push(...devScriptTags);
    }

    if (pluginShare?.canView) {
      inlineScriptBlocks.push(
        `<script>(function(){const scope=document.getElementById("plugin-root");const cfg=${JSON.stringify(
          {
            projectId: pluginShare.projectId,
            canView: pluginShare.canView,
            canManage: pluginShare.canManage,
            apiBase: pluginShare.apiBase,
            role: pluginShare.role,
          }
        )}; if(!scope) return; scope.dataset.projectId = cfg.projectId || ""; scope.dataset.shareRole = cfg.role || ""; scope.dataset.shareCanView = String(!!cfg.canView); scope.dataset.shareCanManage = String(!!cfg.canManage); scope.dataset.shareApiBase = cfg.apiBase || ""; if(!cfg.canView) return; import("/js/utils/project-share.js").then(function(mod){var init = mod && mod.initProjectShareModal; if(typeof init !== "function") return; init({ scope: scope, projectId: cfg.projectId, canView: true, canManage: !!cfg.canManage, apiBase: cfg.apiBase, modal: document.querySelector('[data-modal=\"share-project\"]') });}).catch(function(err){console.error("project share init failed", err);});})();</script>`
      );
    }

    shellModel.inlineScripts = inlineScriptBlocks.join("\n");
    shellModel.styles = unique(shellModel.styles);
    shellModel.scripts = unique(shellModel.scripts);

    logger.debug("- Serving plugin shell", {
      namespace,
      pluginScripts: shellModel.scripts,
      pluginStyles: shellModel.styles,
      pluginHead: shellModel.pluginHead?.length,
    });

    return res.render("layouts/spa/index", shellModel);
  } catch (err) {
    logger.error("✗ Render SPA Module page failed:", err);
    return res.status(500).render("error", {
      code: 500,
      message: "Oops!",
      description: "Failed to load SPA Module",
      error: err?.stack || err?.message || String(err),
      nodeEnv: process.env.NODE_ENV,
    });
  }
}

export async function renderSPA(req, res, _, { plugins }) {
  try {
    const projectId = req.params?.id;
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
    const webEntry = plugin?.entryPoints?.web || null;
    const role = projectContributions?.role || null;
    const pluginShare = {
      projectId,
      role,
      canView: ["owner", "editor"].includes(role || ""),
      canManage: role === "owner",
      apiBase: `/api/projects/${encodeURIComponent(projectId)}/shares`,
    };

    if (!plugin) {
      return res.status(404).render("error", {
        code: 404,
        message: "Plugin unavailable",
        description: "This project is linked to a plugin that is not installed.",
      });
    }

    if (plugin?.framework !== "react") {
      return res.status(404).render("error", {
        code: 404,
        message: "Unsupported Plugin Type",
        description: `${plugin?.framework} plugin framework is not supported yet.`,
      });
    }

    const pluginsRootDir = process.env.PLUGINS_DIR;
    const pluginRoot =
      (pluginsRootDir && namespace ? path.join(pluginsRootDir, namespace) : null) ||
      (webEntry
        ? path.resolve(path.dirname(webEntry), plugin.framework === "react" ? ".." : ".")
        : null);
    const pluginHeaderTemplate = await loadPluginHeaderTemplate(namespace, pluginRoot);
    const pluginHeader = renderPluginHeader(pluginHeaderTemplate, {
      plugin,
      project,
      share: pluginShare,
    });

    if (!pluginRoot) {
      logger.error(`✗ Missing plugin root for namespace "${namespace}"`);
      return res.status(500).render("error", {
        code: 500,
        message: "Plugin Misconfigured",
        description: `Failed to resolve plugin root for "${namespace}".`,
      });
    }

    // TODO: Override res.locals.head for html document meta
    const baseStyles = [];

    const shellModel = {
      layout: false,
      head: res.locals.head,
      pluginMarkup: "",
      pluginHead: "",
      pluginHeader,
      pluginShare,
      styles: baseStyles,
      scripts: [],
      inlineScripts: "",
    };
    const inlineScriptBlocks = [];

    const devServer = await resolveSpaDevServer(plugin, namespace);
    const devScriptTags = [];

    const resolvedNodeEnv = JSON.stringify(process.env.NODE_ENV || "production");
    inlineScriptBlocks.push(
      `<script>(function(){const g=globalThis;g.global ||= g;g.process ||= { env: {} };g.process.env ||= {};if(!g.process.env.NODE_ENV) g.process.env.NODE_ENV = ${resolvedNodeEnv};})();</script>`
    );

    if (devServer) {
      setDevServerCsp(res, devServer.origin);
      const clientUrl = new URL(devServer.client, devServer.origin).toString();
      const entryUrl = new URL(devServer.entry, devServer.origin).toString();
      devScriptTags.push(
        `<script type="module" src="${clientUrl}" data-plugin-dev-client="${namespace}"></script>`
      );
      const preamble = buildReactRefreshPreamble(devServer.origin);
      if (preamble) {
        devScriptTags.push(preamble);
      }
      devScriptTags.push(`<script type="module">import("${entryUrl}");</script>`);
    } else {
      if (!webEntry) {
        return res.status(500).render("error", {
          code: 500,
          message: "Plugin Misconfigured",
          description: `Plugin "${namespace}" is missing a web entry point.`,
        });
      }

      const entryBasename = path.basename(webEntry);
      const entryUrl = resolvePluginAsset(namespace, entryBasename);
      shellModel.scripts = unique([...shellModel.scripts, entryUrl]);

      const distDir = path.join(pluginRoot, "dist");
      if (await pathExists(distDir)) {
        try {
          const cssAssets = await collectCssAssets(distDir);
          if (cssAssets.length) {
            const cssHrefs = cssAssets.map((file) => resolvePluginAsset(namespace, file));
            shellModel.styles = unique([...shellModel.styles, ...cssHrefs]);
            inlineScriptBlocks.push(
              `<script>(function(){const head=document.head;const styles=${JSON.stringify(
                cssHrefs
              )};styles.forEach((href)=>{if(!head.querySelector('link[data-plugin-style="${namespace}"][href="' + href + '"]')){const link=document.createElement('link');link.rel='stylesheet';link.href=href;link.dataset.pluginStyle='${namespace}';head.appendChild(link);}});})();</script>`
            );
          }
        } catch (err) {
          logger.warn(`Unable to read built assets for plugin "${namespace}"`, err);
        }
      } else {
        return res.status(404).render("error", {
          code: 404,
          message: "Unsupported Plugin Type or JSX Markup",
          description: `${plugin?.framework} plugin framework is not supported yet.`,
        });
      }
    }

    // Rendering the plugin ---
    // Prepare the boot context
    const bootContext = {
      plugin: {
        id: plugin.id,
        name: plugin.name,
        namespace,
        framework: plugin.framework,
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
      `<script>window.__sv ??= {}; window.__sv.context = ${JSON.stringify(bootContext)};</script>`
    );
    if (devScriptTags.length) {
      inlineScriptBlocks.push(...devScriptTags);
    }

    if (pluginShare?.canView) {
      inlineScriptBlocks.push(
        `<script>(function(){const scope=document.getElementById("plugin-root");const cfg=${JSON.stringify(
          {
            projectId: pluginShare.projectId,
            canView: pluginShare.canView,
            canManage: pluginShare.canManage,
            apiBase: pluginShare.apiBase,
            role: pluginShare.role,
          }
        )}; if(!scope) return; scope.dataset.projectId = cfg.projectId || ""; scope.dataset.shareRole = cfg.role || ""; scope.dataset.shareCanView = String(!!cfg.canView); scope.dataset.shareCanManage = String(!!cfg.canManage); scope.dataset.shareApiBase = cfg.apiBase || ""; if(!cfg.canView) return; import("/js/utils/project-share.js").then(function(mod){var init = mod && mod.initProjectShareModal; if(typeof init !== "function") return; init({ scope: scope, projectId: cfg.projectId, canView: true, canManage: !!cfg.canManage, apiBase: cfg.apiBase, modal: document.querySelector('[data-modal="share-project"]') });}).catch(function(err){console.error("project share init failed", err);});})();</script>`
      );
    }

    shellModel.inlineScripts = inlineScriptBlocks.join("\n");
    shellModel.styles = unique(shellModel.styles);
    shellModel.scripts = unique(shellModel.scripts);

    logger.debug("- Serving plugin shell", {
      namespace,
      pluginScripts: shellModel.scripts,
      pluginStyles: shellModel.styles,
      pluginHead: shellModel.pluginHead?.length,
    });

    return res.render("layouts/spa/index", shellModel);
  } catch (err) {
    logger.error("✗ Render project page failed:", err);
    return res.status(500).render("error", {
      code: 500,
      message: "Oops!",
      description: "Failed to load project",
      error: err?.stack || err?.message || String(err),
      nodeEnv: process.env.NODE_ENV,
    });
  }
}
