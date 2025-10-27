import express from "express";

import { requireAuth } from "$/middlewares/auth.mjs";
import * as projectsHandler from "$/handlers/projects/index.mjs";
import * as projectSharesHandler from "$/handlers/projects/shares.mjs";

const router = express.Router();

router.post("/", requireAuth, projectsHandler.create);
router.get("/", requireAuth, projectsHandler.getAll);
router.patch("/:id", requireAuth, projectsHandler.update);
router.delete("/:id", requireAuth, projectsHandler.remove);
router.get("/:id/shares", requireAuth, projectSharesHandler.list);
router.post("/:id/shares", requireAuth, projectSharesHandler.create);
router.patch("/:id/shares/:memberId", requireAuth, projectSharesHandler.update);
router.delete("/:id/shares/:memberId", requireAuth, projectSharesHandler.remove);

export default router;
