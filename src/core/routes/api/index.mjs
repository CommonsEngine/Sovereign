import express from "express";

import * as projectsHandler from "$/core/handlers/projects/index.mjs";
import { getAppSettings, updateAppSettings } from "$/core/handlers/app.mjs";
import { requireAuth } from "$/core/middlewares/auth.mjs";
import requireRole from "$/core/middlewares/requireRole.mjs";
import * as usersHandler from "$/core/handlers/users/index.mjs";
import * as projectSharesHandler from "$/core/handlers/projects/shares.mjs";

import blogRouter from "../../../plugins/blog/routes/api.mjs";
import papertrailRouter from "../../../plugins/papertrail/routes/api.mjs";
import { fetchLinkPreview } from "../../../plugins/papertrail/handlers/link-preview.mjs";

const router = express.Router();

// global middleware for these routes
router.use(requireAuth);

// Projects api endpoints
router.post("/projects", projectsHandler.create);
router.get("/projects", projectsHandler.getAll);
router.patch("/projects/:id", projectsHandler.update);
router.delete("/projects/:id", projectsHandler.remove);
router.get("/projects/:id/shares", projectSharesHandler.list);
router.post("/projects/:id/shares", projectSharesHandler.create);
router.patch("/projects/:id/shares/:memberId", projectSharesHandler.update);
router.delete("/projects/:id/shares/:memberId", projectSharesHandler.remove);

router.delete(
  "/users/:id",
  requireRole(["platform:admin"]),
  usersHandler.deleteUser,
);

// Appsettings
router.get("/settings", requireRole(["platform:admin"]), getAppSettings);
router.patch("/settings", requireRole(["platform:admin"]), updateAppSettings);

router.use(blogRouter);
router.use(papertrailRouter);
router.post("/link-preview", fetchLinkPreview);

export default router;
