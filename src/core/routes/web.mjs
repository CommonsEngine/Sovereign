import express from "express";

import { requireAuth } from "$/core/middlewares/auth.mjs";
import requireRole from "$/core/middlewares/requireRole.mjs";
import exposeGlobals from "$/core/middlewares/exposeGlobals.mjs";
import * as projectHandler from "$/core/handlers/projects/index.mjs";
import * as usersHandler from "$/core/handlers/users/index.mjs";
import * as settingsHandler from "$/core/handlers/settings/index.mjs";

import blogRouter from "../../plugins/blog/routes/web.mjs";

const router = express.Router();

router.use([requireAuth, exposeGlobals]);

router.use(blogRouter);

// TODO: We need a way to override globals (html.head) in each web route

router.get("/p/:projectId", projectHandler.viewProject);

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
