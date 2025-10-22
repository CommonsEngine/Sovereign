export default {
  name: "@sovereign/papertrail",
  version: "0.0.0-development",
  async register(ctx) {
    ctx.logger.debug("PaperTrail placeholder register called", {
      plugin: this.name,
    });
  },
  async onEnable() {},
  async onDisable() {},
  async onShutdown() {},
};
