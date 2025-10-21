import express from "express";

import { requireAuth } from "$/core/middlewares/auth.mjs";
import requireRole from "$/core/middlewares/requireRole.mjs";
import exposeGlobals from "$/core/middlewares/exposeGlobals.mjs";
import requireFeature from "$/core/middlewares/requireFeature.mjs";
import * as projectHandler from "$/core/handlers/projects/index.mjs";
import * as usersHandler from "$/core/handlers/users/index.mjs";
import * as settingsHandler from "$/core/handlers/settings/index.mjs";

const router = express.Router();

router.use([requireAuth, exposeGlobals]);

// TODO: We need a way to override globals (html.head) in each web route

// Project Routes
router.get("/p/:projectId", projectHandler.viewProject);

// Project:Blog
router.get(
  "/p/:projectId/configure",
  requireFeature("blog"),
  projectHandler.viewProjectConfigure,
);
router.get(
  "/p/:projectId/blog/post/new",
  requireFeature("blog"),
  projectHandler.blog.viewPostCreate,
);
router.get(
  "/p/:projectId/blog/post/:fp",
  requireFeature("blog"),
  projectHandler.blog.viewPostEdit,
);

router.get(
  "/users",
  requireRole(["platform:admin", "tenant:admin", "project:admin"]),
  usersHandler.viewUsers,
);

router.get(
  "/settings",
  requireRole(["platform:admin", "tenant:admin", "project:admin"]),
  settingsHandler.viewSettings,
);

export default router;
