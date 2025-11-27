import env from "$/config/env.js";
import { prisma } from "$/services/database.js";
import logger from "$/services/logger.js";

const { FEATURE_PASSKEYS_ENABLED } = env();

export async function viewSecurity(req, res) {
  if (!FEATURE_PASSKEYS_ENABLED) {
    return res.status(404).render("error", {
      code: 404,
      message: "Not found",
      description: "Passkeys are disabled by configuration.",
    });
  }

  try {
    const passkeys = await prisma.passkeyCredential.findMany({
      where: { userId: req.user.id },
      orderBy: { createdAt: "desc" },
    });

    return res.render("security", {
      passkeys: passkeys.map((pk) => ({
        id: pk.id,
        deviceType: pk.deviceType || "unspecified",
        backedUp: !!pk.backedUp,
        createdAt: pk.createdAt,
        lastUsedAt: pk.lastUsedAt,
        transports: Array.isArray(pk.transports) ? pk.transports.join(", ") : "",
      })),
      passkeys_enabled: FEATURE_PASSKEYS_ENABLED,
    });
  } catch (err) {
    logger.error("✗ viewSecurity error", err);
    return res.status(500).render("error", {
      code: 500,
      message: "Unable to load security settings",
      description: "Please try again later.",
    });
  }
}
