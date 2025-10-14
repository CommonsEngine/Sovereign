import prisma from "../prisma.mjs";
import logger from "../utils/logger.mjs";

const DEFAULT_SCOPE = "platform";
const KEY_MAX_LENGTH = 200;

export async function updateAppSettings(req, res) {
  const payload = req.body;

  const rawUpdates = Array.isArray(payload)
    ? payload
    : Array.isArray(payload?.settings)
      ? payload.settings
      : null;

  if (!rawUpdates || rawUpdates.length === 0) {
    return res.status(400).json({ error: "No settings provided" });
  }

  const defaultScope =
    (typeof payload?.scope === "string" && payload.scope.trim()) ||
    DEFAULT_SCOPE;

  const updates = [];

  for (let idx = 0; idx < rawUpdates.length; idx += 1) {
    const entry = rawUpdates[idx];
    if (!entry || typeof entry !== "object") {
      return res
        .status(400)
        .json({ error: `Invalid settings entry at index ${idx}` });
    }

    const key = typeof entry.key === "string" ? entry.key.trim() : "";
    if (!key) {
      return res
        .status(400)
        .json({ error: `Missing key for settings entry at index ${idx}` });
    }
    if (key.length > KEY_MAX_LENGTH) {
      return res
        .status(400)
        .json({ error: `Key too long for settings entry at index ${idx}` });
    }

    const scope =
      typeof entry.scope === "string" && entry.scope.trim()
        ? entry.scope.trim()
        : defaultScope;

    updates.push({
      scope,
      key,
      value: entry.value === undefined ? null : entry.value,
    });
  }

  try {
    const updatedSettings = await prisma.$transaction(
      updates.map(({ scope, key, value }) =>
        prisma.appSetting.upsert({
          where: { key },
          update: { value },
          create: { scope, key, value },
          select: { key: true, scope: true, value: true },
        }),
      ),
    );

    const version = await prisma.versionRegistry.upsert({
      where: { id: "appsettings" },
      update: { v: { increment: 1 }, updatedAt: new Date() },
      create: { id: "appsettings", v: 1 },
      select: { v: true },
    });

    return res.json({
      updated: updatedSettings,
      version: version.v,
    });
  } catch (err) {
    logger.error("updateAppSettings failed", err);
    return res.status(500).json({ error: "Failed to update settings" });
  }
}
