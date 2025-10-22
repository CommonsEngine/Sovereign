import * as db from "$/services/database.mjs";
import logger from "$/services/logger.mjs";

import createServer from "./core/server.mjs";
import createExtHost from "./core/ext-host/index.mjs";

async function bootstrap() {
  logger.info("🚀 Starting Sovereign platform...");

  try {
    // Create the server
    // This sets up Express, middlewares, routes, config, and shared services.
    const server = await createServer();

    // Initialize Extention Host
    // Discovers and mounts all plugins under /src/plugins/*
    const extHost = await createExtHost(server.services, {
      pluginsDir: "./src/plugins",
    });
    await extHost.init();
    await extHost.mount(server);

    // Start the HTTP Server
    server.start();

    logger.info("✅ Sovereign server is up and running");
    logger.info(`   ➜  Environment: ${process.env.NODE_ENV || "development"}`);
    logger.info(`   ➜  Listening on ::${server.port}`);

    const enabledPlugins = extHost?.plugins.map((plugin) => plugin.name);
    logger.info(
      `   ➜  Loaded plugins: ${
        enabledPlugins && enabledPlugins.length
          ? enabledPlugins.join(", ")
          : "none"
      }`,
    );

    const shutdown = async (signal) => {
      logger.warn(`Received ${signal}, shutting down gracefully...`);
      try {
        await extHost.shutdown();
        await db.gracefulShutdown();
        if (server.httpServer) server.httpServer.close();
        logger.info("🧹 Clean shutdown complete");
        process.exit(0);
      } catch (err) {
        logger.error("Error during shutdown", err);
        process.exit(1);
      }
    };

    process.on("SIGINT", () => shutdown("SIGINT"));
    process.on("SIGTERM", () => shutdown("SIGTERM"));
  } catch (err) {
    logger.error("❌ Failed to bootstrap Sovereign", err);
    process.exit(1);
  }
}

// Run the bootstrapper
bootstrap();
