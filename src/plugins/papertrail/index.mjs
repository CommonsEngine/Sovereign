export default {
  name: "@sovereign/papertrail",
  version: "0.0.0-development",
  async register(ctx) {
    const { routers, manifest } = ctx;

    if (routers.api) {
      routers.api.get("/", (req, res) => {
        res.json({
          plugin: manifest.name,
          message: "PaperTrail plugin API placeholder online",
        });
      });
    }

    if (routers.web) {
      routers.web.get("/", (req, res) => {
        res.send(
          `<h1>${manifest.name}</h1><p>PaperTrail plugin web placeholder route.</p>`,
        );
      });
    }

    ctx.logger.debug("PaperTrail placeholder register called", {
      plugin: manifest.name,
      mounts: ctx.mounts,
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
