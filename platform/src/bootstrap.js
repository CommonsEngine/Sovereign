/* eslint-disable import/order */
import { connectPrismaWithRetry, gracefulShutdown } from "./services/database.mjs";
import logger from "./services/logger.mjs";
import createExtHost from "./platform/ext-host/index.mjs";
import env from "./config/env.mjs";

// import createServer from "./src/server.mjs";

global.sovereign = { logger }; // Make logger globally accessible (e.g., in Prisma hooks)

export async function bootstrap() {
  logger.info("🚀 Starting Sovereign platform...");
  const start = Date.now();

  try {
    await connectPrismaWithRetry();

    // Discovers and mounts all plugins under /__runtimeDir/plugins/*
    const { __pluginsDir } = env();
    logger.info(`- Plugin directory: ${__pluginsDir}`);
    const extHost = await createExtHost({}, { pluginsDir: __pluginsDir });

    logger.info("- Initializing HTTP server...");
    // // This sets up Express, middlewares, coreRoutes etc.
    // const server = await createServer(extHost);
    // server.start();

    const enabledPlugins = extHost?.plugins.map((plugin) => `${plugin.name}@${plugin.version}`);

    // logger.info(`✓ Sovereign server ready in ${Date.now() - start}ms`);
    // logger.info(`  ➜  Version: ${server.appVersion}`);
    // logger.info(`  ➜  Environment: ${server.nodeEnv}`);
    logger.info(
      `  ➜  Loaded plugins: ${
        enabledPlugins && enabledPlugins.length ? enabledPlugins.join(", ") : "none"
      }`
    );

    // const shutdown = async (signal) => {
    //   logger.warn(`Received ${signal}, shutting down gracefully...`);
    //   try {
    //     await gracefulShutdown(signal);
    //     await server.stop();
    //     logger.info("✓ Clean shutdown complete");
    //   } catch (err) {
    //     logger.error("✗ Error during shutdown", err.stack || err);
    //   } finally {
    //     process.exit(0);
    //   }
    // };

    // process.on("SIGINT", () => shutdown("SIGINT"));
    // process.on("SIGTERM", () => shutdown("SIGTERM"));
  } catch (err) {
    logger.error("✗ Failed to bootstrap Sovereign", err.stack || err);
    process.exitCode = 1;
  }
}
