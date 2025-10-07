import { uuid } from "../../utils/id.mjs";
import logger from "../../utils/logger.mjs";
import { flags } from "../../config/flags.mjs";
import prisma from "../../prisma.mjs";

export { default as gitcms } from "./gitcms.mjs";

export async function create(req, res) {
  try {
    const userId = req.user?.id;
    if (!userId) return res.status(401).json({ error: "Unauthorized" });

    // Build allowed types from flags
    const allowedTypes = new Set(
      [
        flags.gitcms && "gitcms",
        flags.papertrail && "papertrail",
        flags.workspace && "workspace",
      ].filter(Boolean),
    );
    const allowedScopes = new Set(["private", "org", "public"]);

    const raw = req.body || {};
    const name =
      String(raw.name ?? "")
        .trim()
        .slice(0, 120) || "Untitled";

    // If requested type is disabled, fall back to first enabled, else 400
    const requestedType = String(raw.type || "").trim();
    let type = allowedTypes.has(requestedType)
      ? requestedType
      : [...allowedTypes][0];

    if (!type) {
      return res.status(400).json({ error: "No project types are enabled." });
    }

    const scope = allowedScopes.has(String(raw.scope))
      ? String(raw.scope)
      : "private";
    const desc =
      raw.desc != null ? String(raw.desc).trim().slice(0, 500) : null;

    const project = await prisma.project.create({
      data: {
        id: uuid("p_"),
        name,
        desc,
        type,
        scope,
        ownerId: userId,
        ...(type === "papertrail" ? { papertrail: { create: {} } } : {}),
      },
      select: { id: true },
    });

    const url =
      type === "gitcms" ? `/p/${project.id}/configure` : `/p/${project.id}`;
    return res.status(201).json({
      ...project,
      url,
      ...(type === "papertrail"
        ? { papertrail: { nodes: [], edges: [] } }
        : {}),
    });
  } catch (err) {
    logger.error("Create project failed:", err);
    return res.status(500).json({ error: "Failed to create project" });
  }
}

export async function remove(req, res) {
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
  } catch (err) {
    logger.error("Delete project failed:", err);
    return res.status(500).json({ error: "Failed to delete project" });
  }
}

export async function update(req, res) {
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
    if (project.ownerId !== userId) {
      return res.status(403).json({ error: "Forbidden" });
    }

    const raw = req.body || {};
    const name =
      typeof raw.name === "string" ? raw.name.trim().slice(0, 120) : undefined;

    if (!name || name.length === 0) {
      return res.status(400).json({ error: "Invalid name" });
    }

    const updated = await prisma.project.update({
      where: { id },
      data: { name },
      select: { id: true, name: true },
    });

    return res.status(200).json(updated);
  } catch (err) {
    logger.error("Update project failed:", err);
    return res.status(500).json({ error: "Failed to update project" });
  }
}
