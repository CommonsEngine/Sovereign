import express from "express";

import * as handlers from "../handlers/index.mjs";

const router = express.Router();

router.patch("/:projectId/configure", handlers.configureProject);
router.get("/:projectId/post/all", handlers.getAllPosts);
router.delete("/:projectId/post/:fp", handlers.deletePost);
router.patch("/:projectId/post/:fp", handlers.updatePost);
router.post("/:projectId/post/:fp", handlers.publishPost);
router.post("/:projectId/retry-connection", handlers.retryConnection);

export default router;
