import express from "express";

import * as projectsHandler from "../handlers/projects/index.mjs";
import { requireAuth } from "../middlewares/auth.mjs";

const router = express.Router();

// global middleware for these routes
router.use(requireAuth);

// Projects api endpoints
router.post("/projects", projectsHandler.create);
router.get("/projects", projectsHandler.getAll);
router.patch("/projects/:id", projectsHandler.update);
router.delete("/projects/:id", projectsHandler.remove);

router.patch("/projects/:id/blog/configure", projectsHandler.blog.configure);
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

export default router;
