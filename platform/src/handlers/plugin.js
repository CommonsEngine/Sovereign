import path from "node:path";
import fs from "fs/promises";

import logger from "$/services/logger.mjs";
import { prisma } from "$/services/database.mjs";

const EXTERNAL_URL_PATTERN = /^(?:[a-z]+:)?\/\//i;

// const BLANK_RE = /^\s*$/;

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

    if (!plugin) {
      return res.status(404).render("error", {
        code: 404,
        message: "Plugin unavailable",
        description: "This project is linked to a plugin that is not installed.",
      });
    }

    if (plugin?.type !== "spa") {
      return res.status(404).render("error", {
        code: 404,
        message: "Unsupported Plugin Type",
        description: `${plugin?.type} plugin type is not supported yet.`,
      });
    }

    const pluginsRootDir = process.env.PLUGINS_DIR;
    const pluginRoot =
      (pluginsRootDir && namespace ? path.join(pluginsRootDir, namespace) : null) ||
      (plugin.entry
        ? path.resolve(path.dirname(plugin.entry), plugin.type === "spa" ? ".." : ".")
        : null);

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
      styles: baseStyles,
      scripts: [],
      inlineScripts: "",
    };
    const inlineScriptBlocks = [];

    const entryBasename = path.basename(plugin.entry);
    const entryUrl = resolvePluginAsset(namespace, entryBasename);
    shellModel.scripts = unique([...shellModel.scripts, entryUrl]);

    // Add plugin base stylesheet
    baseStyles.push(`/${namespace}.css`);

    const resolvedNodeEnv = JSON.stringify(process.env.NODE_ENV || "production");
    inlineScriptBlocks.push(
      `<script>(function(){const g=globalThis;g.global ||= g;g.process ||= { env: {} };g.process.env ||= {};if(!g.process.env.NODE_ENV) g.process.env.NODE_ENV = ${resolvedNodeEnv};})();</script>`
    );

    const distDir = path.join(pluginRoot, "dist");
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
      } catch (err) {
        logger.warn(`Unable to read built assets for plugin "${namespace}"`, err);
      }
    } else {
      return res.status(404).render("error", {
        code: 404,
        message: "Unsupported Plugin Type or JSX Markup",
        description: `${plugin?.type} plugin type is not supported yet.`,
      });
    }

    // Rendering the plugin ---
    // Prepare the boot context
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
      `<script>window.__sv ??= {}; window.__sv.context = ${JSON.stringify(bootContext)};</script>`
    );

    shellModel.inlineScripts = inlineScriptBlocks.join("\n");
    shellModel.styles = unique(shellModel.styles);
    shellModel.scripts = unique(shellModel.scripts);

    logger.debug("- Serving plugin shell", {
      namespace,
      pluginScripts: shellModel.scripts,
      pluginStyles: shellModel.styles,
      pluginHead: shellModel.pluginHead?.length,
    });

    return res.render("layouts/index", shellModel);
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
