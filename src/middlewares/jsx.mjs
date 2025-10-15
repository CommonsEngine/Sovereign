import fs from "fs/promises";
import path from "path";

import React from "react";
import { renderToString } from "react-dom/server";

import env from "../config/env.mjs";

const { NODE_ENV } = env();

// Attach res.renderJSX(viewPath, props)
export async function useJSX(req, res, next) {
  /**
   * Server-side render a React component located under /src/views.
   * Usage: res.renderJSX("example/react/index", { ...props })
   * - In development: loads the module via Vite's ssrLoadModule (supports .tsx/.jsx).
   * - In production: dynamic import from prebuilt server bundle (expects same path under /dist/server).
   * Sends a complete HTML document and hydrates on a matching client entry if present.
   */
  res.renderJSX = async (viewPath, props = {}) => {
    try {
      const tryExts = [".tsx", ".jsx", ".ts", ".js"];
      const dev = NODE_ENV !== "production";
      const rootDir =
        dev && res.app?.locals?.vite?.config?.root
          ? res.app.locals.vite.config.root
          : process.cwd();
      let mod;
      let resolvedPath;

      for (const ext of tryExts) {
        const p = `/src/views/${viewPath}${ext}`;
        try {
          if (dev) {
            const fsPath = path.join(
              rootDir,
              p.startsWith("/") ? p.slice(1) : p,
            );
            try {
              await fs.access(fsPath);
            } catch {
              continue;
            }
          }
          if (dev) {
            mod = await res.app.locals.vite.ssrLoadModule(p);
          } else {
            // In production, load from built SSR bundle location (adjust if your build differs)
            const url = new URL(`../dist/server${p}`, import.meta.url);
            mod = await import(url);
          }
          resolvedPath = p;
          break;
        } catch {
          // try next extension
        }
      }
      if (!mod) {
        res
          .status(500)
          .send(
            `Could not find JSX view module for "${viewPath}" (looked for .tsx/.jsx/.ts/.js).`,
          );
        return;
      }

      const Component = mod.default || mod.Component || null;
      if (!Component) {
        res
          .status(500)
          .send(
            `Module "${resolvedPath}" has no default export React component.`,
          );
        return;
      }

      // Allow the component to receive request context if desired
      const componentProps = {
        ...props,
        url: req.originalUrl,
        params: req.params,
        query: req.query,
        user: req.user ?? null,
      };

      // Render HTML
      const appHTML = renderToString(
        React.createElement(Component, componentProps),
      );

      // Try to resolve a matching client entry for hydration during dev (optional)
      let hydrateScript = "";
      const clientCandidates = [
        resolvedPath.replace(/(\.tsx|\.ts)$/, ".client.tsx"),
        resolvedPath.replace(/(\.jsx|\.js)$/, ".client.jsx"),
        resolvedPath.replace(/(\.jsx|\.js|\.tsx|\.ts)$/, ".client.tsx"),
      ];
      if (dev) {
        for (const cand of clientCandidates) {
          try {
            await res.app.locals.vite.transformRequest(cand);
            hydrateScript = `<script type="module" src="${cand}"></script>`;
            break;
          } catch {
            // ignore
          }
        }
      } else {
        // In production, expect client assets to be referenced from your manifest.
        // You can replace this with a proper manifest lookup.
        // hydrateScript = `<script type="module" src="/assets/${viewPath}.client.js"></script>`;
      }

      const headHtml = await renderHead(res);
      const htmlLang = escapeAttr(
        res.locals?.head?.lang?.short || res.locals?.head?.lang || "en",
      );

      res.setHeader("Content-Type", "text/html; charset=utf-8");
      res.send(`<!doctype html>
<html lang="${htmlLang}">
  <head>
${headHtml.trimEnd()}
  </head>
  <body>
    <div id="app">${appHTML}</div>
    <script>window.__SSR_PROPS__ = ${JSON.stringify(componentProps).replace(/</g, "\\u003c")}</script>
    ${hydrateScript}
  </body>
</html>`);
    } catch (err) {
      next(err);
    }
  };
  next();
}

function escapeAttr(value) {
  return String(value ?? "").replace(/"/g, "&quot;");
}

async function renderHead(res) {
  const locals = {
    ...res.locals,
  };

  return new Promise((resolve, reject) => {
    res.app.render(
      "_partials/layout/head",
      { ...locals, layout: false },
      (err, rendered) => {
        if (err) {
          reject(err);
        } else {
          resolve(rendered || "");
        }
      },
    );
  }).catch(() => {
    const title = (locals.head && locals.head.title) || "Sovereign";
    const version = locals.app?.version || "0.0.0";
    return `<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<title>${title}</title>
<link rel="icon" type="image/svg+xml" href="/assets/favicon.svg" />
<link rel="stylesheet" href="/css/global.css?v=${version}" />`;
  });
}
