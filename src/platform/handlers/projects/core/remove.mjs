import { prisma } from "$/services/database.mjs";
import logger from "$/services/logger.mjs";
import {
  ensureProjectAccess,
  ProjectAccessError,
} from "$/utils/projectAccess.mjs";

export default async function remove(req, res) {
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
        allowedRoles: ["owner"],
      });
    } catch (err) {
      if (err instanceof ProjectAccessError) {
        return res.status(err.status ?? 403).json({ error: err.message });
      }
      throw err;
    }

    // Cascades will remove subtype records (blog/papertrail/workspace) and related rows as defined in schema
    await prisma.project.delete({ where: { id: projectId } });

    return res.status(204).end();
  } catch (err) {
    logger.error("✗ Delete project failed:", err);
    return res.status(500).json({ error: "Failed to delete project" });
  }
}
