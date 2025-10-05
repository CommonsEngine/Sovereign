import prisma from "../prisma.mjs";
import { uuid } from "../utils/id.mjs";

export async function createProject(req, res) {
  try {
    const userId = req.user?.id;
    if (!userId) return res.status(401).json({ error: "Unauthorized" });

    const allowedTypes = new Set(["gitcms", "papertrail", "workspace"]);
    const allowedScopes = new Set(["private", "org", "public"]);

    const raw = req.body || {};
    const name =
      String(raw.name ?? "")
        .trim()
        .slice(0, 120) || "Untitled";
    const type = allowedTypes.has(String(raw.type))
      ? String(raw.type)
      : "gitcms";
    const scope = allowedScopes.has(String(raw.scope))
      ? String(raw.scope)
      : "private";
    const des = raw.des != null ? String(raw.des).trim().slice(0, 500) : null;

    const project = await prisma.project.create({
      data: {
        id: uuid("p_"),
        name,
        des,
        type,
        scope,
        ownerId: userId,
      },
      select: {
        id: true,
      },
    });
    return res.status(201).json(project);
  } catch (e) {
    console.error("Create project failed:", e);
    return res.status(500).json({ error: "Failed to create project" });
  }
}

export async function deleteProject(req, res) {
  try {
    const userId = req.user?.id;
    if (!userId) return res.status(401).json({ error: "Unauthorized" });

    const id = req.params?.id || req.body?.id;
    if (!id) return res.status(400).json({ error: "Missing project id" });

    const project = await prisma.project.findUnique({
      where: { id },
      select: { ownerId: true },
    });
    if (!project) return res.status(404).json({ error: "Project not found" });

    // Only the owner can delete
    if (project.ownerId !== userId) {
      return res.status(403).json({ error: "Forbidden" });
    }

    // Cascades will remove subtype records (gitcms/papertrail/workspace) and related rows as defined in schema
    await prisma.project.delete({ where: { id } });

    return res.status(204).end();
  } catch (e) {
    console.error("Delete project failed:", e);
    return res.status(500).json({ error: "Failed to delete project" });
  }
}
