import express from "express";

import * as indexHandler from "../handlers/index.mjs";

const router = express.Router();

router.patch("/:projectId/configure", indexHandler.configureProject);
router.get("/:projectId/post/all", indexHandler.getAllPosts);
router.delete("/:projectId/post/:fp", indexHandler.deletePost);
router.patch("/:projectId/post/:fp", indexHandler.updatePost);
router.post("/:projectId/post/:fp", indexHandler.publishPost);
router.post("/:projectId/retry-connection", indexHandler.retryConnection);

export default router;
