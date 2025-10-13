import logger from "../../../utils/logger.mjs";
import prisma from "../../../prisma.mjs";

export default async function getAll(req, res) {
  console.log("GET /api/projects");
  try {
    const projectsRaw = await prisma.project.findMany({
      where: { OR: [{ ownerId: null }, { ownerId: req.user.id }] },
      select: {
        ownerId: true,
        id: true,
        type: true,
        name: true,
        desc: true,
        scope: true,
        status: true,
        createdAt: true,
        updatedAt: true,
      },
    });
    const projects = projectsRaw
      .map((p) => ({
        ...p,
        owned: p.ownerId === req.user.id,
      }))
      .sort((a, b) => b.createdAt - a.createdAt /* newest first */)
      .map((p) => ({
        ...p,
        ownerId: undefined,
      }));
    return res.json({ projects });
  } catch (error) {
    logger.error("Failed to get projects:", error);
    return res.status(500).json({ error: "Failed to get projects" });
  }
}
