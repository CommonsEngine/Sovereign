import express from "express";

import { requireAuth } from "$/middlewares/auth.js";
import requireRole from "$/middlewares/requireRole.js";
import rateLimiters from "$/middlewares/rateLimit.js";
import * as invites from "$/handlers/invites/index.js";

const router = express.Router();

router.post("/exchange", rateLimiters.public, invites.exchange);

router.use(
  requireAuth,
  rateLimiters.authedApi,
  requireRole(["cap:user:invite.admin", "platform:admin"])
);

router.get("/", invites.list);
router.post("/", invites.create);
router.get("/:id", invites.get);
router.post("/:id/revoke", invites.revoke);

export default router;
