import express from "express";

import env from "$/config/env.js";
import { requireAuth } from "$/middlewares/auth.js";
import rateLimiters from "$/middlewares/rateLimit.js";
import logger from "$/services/logger.js";
import { createSetup, disableTotp, regenerateRecoveryCodes, verifySetup } from "$/services/totp.js";

const router = express.Router();
const { FEATURE_TOTP_ENABLED } = env();

function guard(res) {
  if (!FEATURE_TOTP_ENABLED) {
    res.status(404).json({ error: "totp_disabled" });
    return true;
  }
  return false;
}

router.post("/setup", requireAuth, rateLimiters.authedApi, async (req, res) => {
  if (guard(res)) return;
  try {
    const payload = await createSetup(req.user);
    return res.json({ ok: true, ...payload });
  } catch (err) {
    logger.warn("totp setup failed", err);
    return res.status(400).json({ error: err.code || "totp_setup_failed", message: err.message });
  }
});

router.post("/verify", requireAuth, rateLimiters.authedApi, async (req, res) => {
  if (guard(res)) return;
  try {
    const { code } = req.body || {};
    const recoveryCodes = await verifySetup(req.user.id, code);
    return res.json({ ok: true, recoveryCodes });
  } catch (err) {
    logger.warn("totp verify failed", err);
    return res.status(400).json({ error: err.code || "totp_verify_failed", message: err.message });
  }
});

router.post("/recovery/regenerate", requireAuth, rateLimiters.authedApi, async (req, res) => {
  if (guard(res)) return;
  try {
    const recoveryCodes = await regenerateRecoveryCodes(req.user.id);
    return res.json({ ok: true, recoveryCodes });
  } catch (err) {
    logger.warn("totp recovery regen failed", err);
    return res.status(400).json({
      error: err.code || "totp_recovery_failed",
      message: err.message || "Could not regenerate codes",
    });
  }
});

router.post("/disable", requireAuth, rateLimiters.authedApi, async (req, res) => {
  if (guard(res)) return;
  try {
    await disableTotp(req.user.id);
    return res.json({ ok: true });
  } catch (err) {
    logger.warn("totp disable failed", err);
    return res.status(400).json({ error: "totp_disable_failed", message: err.message });
  }
});

export default router;
