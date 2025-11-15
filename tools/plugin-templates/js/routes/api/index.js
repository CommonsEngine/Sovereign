import express from "express";

export default (ctx = {}) => {
  const router = express.Router();

  router.get("/", (_req, res) => {
    res.json({
      message: "{{DISPLAY_NAME}} API route is live!",
      plugin: "{{PLUGIN_ID}}",
      contextKeys: Object.keys(ctx),
    });
  });

  return router;
};
