import express from "express";

import * as handlers from "../handlers/index.mjs";

const router = express.Router();

router.patch("/blog/:projectId/configure", handlers.configureProject);
router.get("/blog/:projectId/post/all", handlers.getAllPosts);
router.delete("/blog/:projectId/post/:fp", handlers.deletePost);
router.patch("/blog/:projectId/post/:fp", handlers.updatePost);
router.post("/blog/:projectId/post/:fp", handlers.publishPost);
router.post("/blog/:projectId/retry-connection", handlers.retryConnection);

export default router;
