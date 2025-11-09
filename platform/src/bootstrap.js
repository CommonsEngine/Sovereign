import path from "node:path";

import { connectPrismaWithRetry, gracefulShutdown } from "$/services/database.js";
import logger from "$/services/logger.js";
import createExtHost from "$/ext-host/index.js";

import createServer from "./server.js";

global.sovereign = { logger }; // Make logger globally accessible (e.g., in Prisma hooks)

export async function bootstrap(manifest) {
  logger.info("🚀 Starting Sovereign platform...");
  logger.info(`➜ Root directory: ${manifest.__rootdir}`);
  logger.info(`➜ Plugin directory: ${manifest.__pluginsdir}`);
  const start = Date.now();

  process.on("unhandledRejection", (reason) => {
    logger.error("✗ Unhandled promise rejection:", reason);
  });
  process.on("uncaughtException", (err) => {
    logger.error("✗ Uncaught exception:", err?.stack || err);
  });

  try {
    await connectPrismaWithRetry();

    // Discovers and mounts all plugins under /__runtimeDir/plugins/*
    const __pluginsdir = path.resolve(manifest.__pluginsdir);
    const extHost = await createExtHost(manifest, { pluginsDir: __pluginsdir });

    logger.info("- Initializing HTTP server...");
    const server = await createServer(extHost);
    await server.start();

    // platform/src/bootstrap.js (after await server.start())
    const handles = process._getActiveHandles?.() || [];
    logger.info(
      `  ➜  Active Handles: ${handles.length} :: ${handles.map((h) => h.constructor?.name || typeof h).join(", ")}`
    );

    logger.info(`✓ Sovereign server ready in ${Date.now() - start}ms`);
    logger.info(`  ➜  Version: ${server.appVersion}`);
    logger.info(`  ➜  Environment: ${server.nodeEnv}`);
    logger.info(
      `  ➜  Loaded plugins: ${
        manifest?.enabledPlugins && manifest?.enabledPlugins.length
          ? manifest?.enabledPlugins.join(", ")
          : "none"
      }`
    );

    const shutdown = async (signal) => {
      logger.warn(`Received ${signal}, shutting down gracefully...`);
      try {
        await gracefulShutdown(signal);
        await server.stop();
        logger.info("✓ Clean shutdown complete");
      } catch (err) {
        logger.error("✗ Error during shutdown", err.stack || err);
      } finally {
        process.exit(0);
      }
    };

    process.on("SIGINT", () => shutdown("SIGINT"));
    process.on("SIGTERM", () => shutdown("SIGTERM"));
  } catch (err) {
    logger.error("✗ Failed to bootstrap Sovereign", err.stack || err);
    process.exitCode = 1;
  }
}
