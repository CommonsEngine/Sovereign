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
