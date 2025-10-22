import express from "express";

import { requireAuth } from "$/core/middlewares/auth.mjs";
import exposeGlobals from "$/core/middlewares/exposeGlobals.mjs";
import requireFeature from "$/core/middlewares/requireFeature.mjs";

import * as handlers from "../handlers/index.mjs";

const router = express.Router();

router.use([requireAuth, exposeGlobals]);

router.get(
  "/blog/:projectId/configure",
  requireFeature("blog"),
  handlers.viewProjectConfigure,
);
router.get(
  "/blog/:projectId/post/new",
  requireFeature("blog"),
  handlers.viewPostCreate,
);
router.get(
  "/blog/:projectId/post/:fp",
  requireFeature("blog"),
  handlers.viewPostEdit,
);

export default router;
