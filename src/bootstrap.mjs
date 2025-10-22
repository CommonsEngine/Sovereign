import createServer, { createExtHost } from "./core/server.mjs";
import * as db from "./core/services/database.mjs";
import logger from "./core/services/logger.mjs";

async function bootstrap() {
  logger.info("🚀 Starting Sovereign platform...");

  try {
    let extHost = null;

    // Create the server
    // This sets up Express, middlewares, routes, config, and shared services.
    const server = await createServer();

    // Initialize Extension Host: discovers and mounts plugins under /src/plugins/*
    extHost = await createExtHost(server.services, {
      pluginsDir: "./src/plugins",
      logger,
    });
    await extHost.init();
    await extHost.mount(server.app);

    // Start the HTTP Server
    await server.start();

    logger.info("✅ Sovereign server is up and running");
    logger.info(`   ➜  Environment: ${process.env.NODE_ENV || "development"}`);
    logger.info(`   ➜  Listening on: http://localhost:${server.port}`);
    const enabledPlugins = extHost?.plugins
      ?.filter((plugin) => plugin.status === "enabled")
      .map((plugin) => plugin.manifest.name);
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
        await extHost?.shutdown?.();
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
