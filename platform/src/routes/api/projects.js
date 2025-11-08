import express from "express";

import { requireAuth } from "$/middlewares/auth.js";
import rateLimiters from "$/middlewares/rateLimit.js";
import * as projectsHandler from "$/handlers/projects/index.js";
import * as projectSharesHandler from "$/handlers/projects/shares.js";

const router = express.Router();

router.use(requireAuth, rateLimiters.authedApi);

router.post("/", projectsHandler.create);
router.get("/", projectsHandler.getAll);
router.patch("/:id", projectsHandler.update);
router.delete("/:id", projectsHandler.remove);
router.get("/:id/shares", projectSharesHandler.list);
router.post("/:id/shares", projectSharesHandler.create);
router.patch("/:id/shares/:memberId", projectSharesHandler.update);
router.delete("/:id/shares/:memberId", projectSharesHandler.remove);

export default router;
