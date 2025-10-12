import express from "express";

import * as projectsHandler from "../handlers/projects/index.mjs";
import { requireAuth } from "../middlewares/auth.mjs";

const router = express.Router();

// global middleware for these routes
router.use(requireAuth);

// Projects api endpoints
router.post("/projects", projectsHandler.create);

export default router;
