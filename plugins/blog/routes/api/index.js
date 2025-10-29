import express from "express";

import * as blogHandler from "../../handlers/blog/index.js";

export default (ctx) => {
  const router = express.Router();

  router.patch("/:id/configure", (req, res, next) => {
    return blogHandler.configure.patch(req, res, next, ctx);
  });

  router.get("/:id/posts", (req, res, next) => {
    return blogHandler.posts.get(req, res, next, ctx);
  });

  router.post("/:id/posts/:fp", (req, res, next) => {
    return blogHandler.posts.post(req, res, next, ctx);
  });

  router.patch("/:id/posts/:fp", (req, res, next) => {
    return blogHandler.posts.patch(req, res, next, ctx);
  });

  router.delete("/:id/posts/:fp", (req, res, next) => {
    return blogHandler.posts.remove(req, res, next, ctx);
  });

  router.post("/:id/retry-connection", (req, res, next) => {
    return blogHandler.retryConnection(req, res, next, ctx);
  });

  return router;
};
