// eslint-disable-next-line import/order
// import express from "express";
import path from "path";

import { discoverManifests } from "./loader.mjs";

function resolvePluginsDir(pluginsDir) {
  if (!pluginsDir) {
    throw new Error("pluginsDir is required to initialize the extension host");
  }

  const parsed = path.isAbsolute(pluginsDir)
    ? pluginsDir
    : path.join(process.cwd(), pluginsDir);

  return parsed;
}

export default async function createExtHost(services = {}, options = {}) {
  const pluginsDir = resolvePluginsDir(options.pluginsDir || "./src/plugins");

  const context = {
    services,
    pluginsDir,
    logger: services?.logger,
    manifests: [],
    plugins: [],
  };

  // Init
  async function init() {
    context.manifests = await discoverManifests(pluginsDir, {
      logger: context.logger,
    });
  }

  async function mount({ app }) {
    if (!app || typeof app.use !== "function") {
      throw new Error(
        "Extension host mount requires an Express app instance with app.use()",
      );
    }

    context.plugins = [];

    if (context.manifests.length === 0) {
      context.logger.log("Extension host: no plugins discovered");
      return context.plugins;
    }

    for (const manifest of context.manifests) {
      context.plugins.push(manifest);
      // TODO: load all active plugins
    }

    return context.plugins;
  }

  async function shutdown() {
    // TODO: Clean pluginState
  }

  return {
    init,
    mount,
    shutdown,
    get manifests() {
      return context.manifests;
    },
    get plugins() {
      return context.plugins;
    },
  };
}

export { discoverManifests } from "./loader.mjs";
