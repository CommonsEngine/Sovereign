import express from "express";

import { requireAuth } from "../middlewares/auth.mjs";
import { requireRole } from "../middlewares/user.mjs";
import { exposeGlobals } from "../middlewares/misc.mjs";
import * as projectHandler from "../handlers/projects/index.mjs";
import * as usersHandler from "../handlers/users/index.mjs";
import * as settingsHandler from "../handlers/settings/index.mjs";

const router = express.Router();

// Project Routes
router.get(
  "/p/:projectId",
  requireAuth,
  exposeGlobals,
  projectHandler.viewProject,
);
router.get(
  "/p/:projectId/configure",
  requireAuth,
  exposeGlobals,
  projectHandler.viewProjectConfigure,
);
router.get(
  "/p/:projectId/blog/post/new",
  requireAuth,
  exposeGlobals,
  projectHandler.blog.viewPostCreate,
);
router.get(
  "/p/:projectId/blog/post/:fp",
  requireAuth,
  exposeGlobals,
  projectHandler.blog.viewPostEdit,
);

router.get(
  "/users",
  requireAuth,
  exposeGlobals,
  requireRole(["platform_admin", "tenant_admin", "admin"]),
  usersHandler.viewUsers,
);

router.get(
  "/settings",
  requireAuth,
  exposeGlobals,
  requireRole(["platform_admin", "tenant_admin", "admin"]),
  settingsHandler.viewSettings,
);

export default router;
