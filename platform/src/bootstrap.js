import path from "node:path";

import { connectPrismaWithRetry, gracefulShutdown } from "$/services/database.mjs";
import logger from "$/services/logger.mjs";
import createExtHost from "$/ext-host/index.mjs";

import createServer from "./server.js";

global.sovereign = { logger }; // Make logger globally accessible (e.g., in Prisma hooks)

export async function bootstrap(manifest) {
  logger.info("🚀 Starting Sovereign platform...");
  logger.info(`- Root directory: ${manifest.__rootdir}`);
  logger.info(`- Plugin directory: ${manifest.__pluginsdir}`);
  const start = Date.now();

  try {
    await connectPrismaWithRetry();

    // Discovers and mounts all plugins under /__runtimeDir/plugins/*
    const __pluginsdir = path.resolve(manifest.__pluginsdir);
    const extHost = await createExtHost(manifest, { pluginsDir: __pluginsdir });

    logger.info("- Initializing HTTP server...");
    // This sets up Express, middlewares, coreRoutes etc.
    const server = await createServer(extHost);
    server.start();

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
        // await server.stop();
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
