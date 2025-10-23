/* eslint-disable import/order */
import "dotenv/config";

import {
  connectPrismaWithRetry,
  gracefulShutdown,
} from "$/services/database.mjs";
import createExtHost from "$/platform/ext-host/index.mjs";

import logger from "$/services/logger.mjs";
global.logger = logger; // Make logger globally accessible (e.g., in Prisma hooks)

import createServer from "./server.mjs";

async function bootstrap() {
  logger.info("🚀 Starting Sovereign platform...");

  try {
    // Connect to the database
    await connectPrismaWithRetry();

    // Initialize Extention Host
    // Discovers and mounts all plugins under /src/plugins/*
    const extHost = await createExtHost(
      {},
      {
        pluginsDir: "./src/plugins",
      },
    );

    // Create the server
    // This sets up Express, middlewares, coreRoutes etc.
    const server = await createServer(extHost);

    // Start the HTTP Server
    server.start();

    logger.info("✓ Sovereign server is up and running");
    logger.info(`  ➜  Environment: ${process.env.NODE_ENV || "development"}`);

    const enabledPlugins = extHost?.plugins.map((plugin) => plugin.name);
    logger.info(
      `  ➜  Loaded plugins: ${
        enabledPlugins && enabledPlugins.length
          ? enabledPlugins.join(", ")
          : "none"
      }`,
    );

    const shutdown = async (signal) => {
      logger.warn(`Received ${signal}, shutting down gracefully...`);
      try {
        await gracefulShutdown(signal);
        await server.stop();
        logger.info("✓ Clean shutdown complete");
        process.exit(0);
      } catch (err) {
        logger.error("✗ Error during shutdown", err);
        process.exit(1);
      }
    };

    process.on("SIGINT", () => shutdown("SIGINT"));
    process.on("SIGTERM", () => shutdown("SIGTERM"));
  } catch (err) {
    logger.error("✗ Failed to bootstrap Sovereign", err);
    process.exit(1);
  }
}

// Run the bootstrapper
bootstrap();
