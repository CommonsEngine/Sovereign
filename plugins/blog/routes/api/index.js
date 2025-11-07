import express from "express";

import * as blogHandler from "../../handlers/blog/index.js";

export default (ctx) => {
  const router = express.Router();

  const makeCapabilityGuard = (capability) => {
    if (ctx?.pluginAuth?.require) {
      return ctx.pluginAuth.require({ capabilities: [capability] });
    }
    return (req, res, next) => next();
  };

  const requireFeature = makeCapabilityGuard("user:plugin.blog.feature");
  const requirePostRead = makeCapabilityGuard("user:plugin.blog.post.read");
  const requirePostCreate = makeCapabilityGuard("user:plugin.blog.post.create");
  const requirePostUpdate = makeCapabilityGuard("user:plugin.blog.post.update");
  const requirePostDelete = makeCapabilityGuard("user:plugin.blog.post.delete");
  const requirePublish = makeCapabilityGuard("user:plugin.blog.post.publish");

  router.patch("/:id/configure", requireFeature, (req, res, next) => {
    return blogHandler.configure.patch(req, res, next, ctx);
  });

  router.get("/:id/posts", requirePostRead, (req, res, next) => {
    return blogHandler.posts.get(req, res, next, ctx);
  });

  router.post("/:id/posts/:fp", requirePostCreate, (req, res, next) => {
    return blogHandler.posts.post(req, res, next, ctx);
  });

  router.patch("/:id/posts/:fp", requirePostUpdate, (req, res, next) => {
    return blogHandler.posts.patch(req, res, next, ctx);
  });

  router.delete("/:id/posts/:fp", requirePostDelete, (req, res, next) => {
    return blogHandler.posts.remove(req, res, next, ctx);
  });

  router.post("/:id/retry-connection", requirePublish, (req, res, next) => {
    return blogHandler.retryConnection(req, res, next, ctx);
  });

  return router;
};
