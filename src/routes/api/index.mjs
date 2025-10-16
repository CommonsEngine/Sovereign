import express from "express";

import * as projectsHandler from "$/handlers/projects/index.mjs";
import { getAppSettings, updateAppSettings } from "$/handlers/app.mjs";
import { requireAuth } from "$/middlewares/auth.mjs";
import requireRole from "$/middlewares/requireRole.mjs";
import * as usersHandler from "$/handlers/users/index.mjs";

import blogRouter from "./blog.mjs";

const router = express.Router();

// global middleware for these routes
router.use(requireAuth);

// Projects api endpoints
router.post("/projects", projectsHandler.create);
router.get("/projects", projectsHandler.getAll);
router.patch("/projects/:id", projectsHandler.update);
router.delete("/projects/:id", projectsHandler.remove);
router.patch("/projects/:id/configure", projectsHandler.configureProject);

router.delete(
  "/users/:id",
  requireRole(["platform_admin"]),
  usersHandler.deleteUser,
);

// Appsettings
router.get("/settings", requireRole(["platform_admin"]), getAppSettings);
router.patch("/settings", requireRole(["platform_admin"]), updateAppSettings);

router.use(blogRouter);

export default router;
