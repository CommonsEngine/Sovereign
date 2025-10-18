import logger from "$/utils/logger.mjs";
import prisma from "$/prisma.mjs";
import {
  ensureProjectAccess,
  ProjectAccessError,
} from "$/libs/projectAccess.mjs";

export default async function update(req, res) {
  try {
    const userId = req.user?.id;
    if (!userId) return res.status(401).json({ error: "Unauthorized" });

    const projectId = req.params?.id || req.body?.id;
    if (!projectId)
      return res.status(400).json({ error: "Missing project id" });

    try {
      await ensureProjectAccess({
        projectId,
        user: req.user,
        allowedRoles: ["owner", "editor"],
      });
    } catch (err) {
      if (err instanceof ProjectAccessError) {
        return res.status(err.status ?? 403).json({ error: err.message });
      }
      throw err;
    }

    const raw = req.body || {};

    const name =
      typeof raw.name === "string" ? raw.name.trim().slice(0, 120) : undefined;

    if (!name || name.length === 0) {
      return res.status(400).json({ error: "Invalid name" });
    }

    const allowedFields = ["name"];
    const data = {};
    for (const field of allowedFields) {
      if (field in raw) data[field] = raw[field];
    }
    if (Object.keys(data).length === 0) {
      return res.status(400).json({ error: "No valid fields to update" });
    }

    const updated = await prisma.project.update({
      where: { id: projectId },
      data,
      select: {
        id: true,
        name: true,
      },
    });

    return res.json(updated);
  } catch (err) {
    logger.error("Update project failed:", err);
    return res.status(500).json({ error: "Failed to update project" });
  }
}
