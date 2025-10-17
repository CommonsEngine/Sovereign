import express from "express";

import { requireAuth } from "$/middlewares/auth.mjs";
import * as authHandler from "$/handlers/auth/index.mjs";

const router = express.Router();

router.post("/auth/invite", requireAuth, authHandler.inviteUser);
router.get("/auth/guest", authHandler.guestLogin);
router.get("/auth/me", requireAuth, authHandler.getCurrentUser);
router.get("/auth/verify", authHandler.verifyToken); // Request /?token=...
router.post("/auth/password/forgot", authHandler.forgotPassword); // Request Body { email }
router.post("/auth/password/reset", authHandler.resetPassword); // Request Body { token, password }

export default router;
