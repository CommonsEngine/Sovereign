import express from "express";

import { requireAuth } from "$/platform/middlewares/auth.mjs";
import exposeGlobals from "$/platform/middlewares/exposeGlobals.mjs";
import requireFeature from "$/platform/middlewares/requireFeature.mjs";

import * as handlers from "../handlers/index.mjs";

const router = express.Router();

router.use([requireAuth, exposeGlobals]);

router.get(
  "/:projectId/configure",
  requireFeature("blog"),
  handlers.viewProjectConfigure,
);
router.get(
  "/:projectId/post/new",
  requireFeature("blog"),
  handlers.viewPostCreate,
);
router.get(
  "/:projectId/post/:fp",
  requireFeature("blog"),
  handlers.viewPostEdit,
);

export default router;
