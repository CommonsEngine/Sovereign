import logger from "../../../utils/logger.mjs";
import prisma from "../../../prisma.mjs";

export default async function remove(req, res) {
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

    // Only the owner can delete
    if (project.ownerId !== userId) {
      return res.status(403).json({ error: "Forbidden" });
    }

    // Cascades will remove subtype records (blog/papertrail/workspace) and related rows as defined in schema
    await prisma.project.delete({ where: { id: projectId } });

    return res.status(204).end();
  } catch (err) {
    logger.error("Delete project failed:", err);
    return res.status(500).json({ error: "Failed to delete project" });
  }
}
