import express from "express";

import * as handlers from "../handlers/index.mjs";

const router = express.Router();

router.get("/blog/post/all", handlers.getAllPosts);
router.delete("/blog/post/:fp", handlers.deletePost);
router.patch("/blog/post/:fp", handlers.updatePost);
router.post("/blog/post/:fp", handlers.publishPost);
router.post("/blog/retry-connection", handlers.retryConnection);

export default router;
