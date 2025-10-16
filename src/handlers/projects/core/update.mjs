import logger from "$/utils/logger.mjs";
import prisma from "$/prisma.mjs";

export default async function update(req, res) {
  try {
    const userId = req.user?.id;
    if (!userId) return res.status(401).json({ error: "Unauthorized" });

    const projectId = req.params?.id || req.body?.id;
    if (!projectId)
      return res.status(400).json({ error: "Missing project id" });

    const project = await prisma.project.findUnique({
      where: { id: projectId },
      select: { ownerId: true },
    });
    if (!project) return res.status(404).json({ error: "Project not found" });
    if (project.ownerId !== userId) {
      return res.status(403).json({ error: "Forbidden" });
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
