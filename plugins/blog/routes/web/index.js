import express from "express";

import * as blogHandler from "../../handlers/blog/index.js";

export default (ctx) => {
  const router = express.Router();

  router.get("/:id", (req, res, next) => {
    return blogHandler.get(req, res, next, ctx);
  });

  router.get("/:id/configure", async (req, res, next) => {
    return blogHandler.configure.get(req, res, next, ctx);
  });

  router.get("/:id/post/new", async (req, res, next) => {
    return blogHandler.editor.viewPostCreate(req, res, next, ctx);
  });

  router.get("/:id/post/:fp", async (req, res, next) => {
    return blogHandler.editor.get(req, res, next, ctx);
  });

  return router;
};
