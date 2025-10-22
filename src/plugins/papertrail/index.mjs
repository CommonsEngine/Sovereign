import apiRouter from "./backend/routes/api.mjs";

export default {
  name: "@sovereign/papertrail",
  version: "0.0.0-development",
  async register(ctx) {
    const { routers, services, mounts } = ctx;

    if (routers.api) {
      routers.api.use(apiRouter);
    }

    // Backwards compatibility: legacy core endpoints lived under /api/projects/*
    // Mount the same router on the main app if available so existing clients keep working.
    const legacyApiBase = "/api";
    if (services?.app?.use) {
      services.app.use(legacyApiBase, apiRouter);
      ctx.logger.debug("Mounted PaperTrail API for legacy routes", {
        base: legacyApiBase,
      });
    }

    ctx.logger.info("PaperTrail plugin registered", {
      mounts,
    });
  },
  async onEnable(ctx) {
    ctx.logger.info("PaperTrail plugin enabled");
  },
  async onDisable(ctx, meta = {}) {
    ctx.logger.info("PaperTrail plugin disabled", meta);
  },
  async onShutdown(ctx, meta = {}) {
    ctx.logger.info("PaperTrail plugin shutdown", meta);
  },
};
