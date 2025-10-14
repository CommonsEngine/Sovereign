import express from "express";

import * as projectsHandler from "../../handlers/projects/index.mjs";
import { updateAppSettings } from "../../handlers/app.mjs";
import { requireAuth } from "../../middlewares/auth.mjs";

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

// Appsettings
router.patch("/settings", updateAppSettings);

router.use(blogRouter);

export default router;
