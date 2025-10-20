import express from "express";

import * as projectsHandler from "$/handlers/projects/index.mjs";

const router = express.Router();

// TODO: Move `/projects` prefix to parent router

router.get(
  "/projects/:projectId/blog/post/all",
  projectsHandler.blog.getAllPosts,
);
router.delete(
  "/projects/:projectId/blog/post/:fp",
  projectsHandler.blog.deletePost,
);
router.patch(
  "/projects/:projectId/blog/post/:fp",
  projectsHandler.blog.updatePost,
);
router.post(
  "/projects/:projectId/blog/post/:fp",
  projectsHandler.blog.publishPost,
);
router.post(
  "/projects/:projectId/blog/retry-connection",
  projectsHandler.blog.retryConnection,
);

export default router;
