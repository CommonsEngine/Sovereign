import logger from "../../utils/logger.mjs";
import prisma from "../../prisma.mjs";

export { default as create } from "./create.mjs";
export { default as getAll } from "./getAll.mjs";
export { default as update } from "./update.mjs";
export { default as remove } from "./remove.mjs";

export * as blog from "./blog/index.mjs";

const DEFAULT_SELECT = {
  id: true,
  name: true,
  type: true,
  status: true,
  createdAt: true,
  updatedAt: true,
  ownerId: true,
  Blog: { select: { projectId: true, gitConfig: true } },
};

// TODO: Maybe we can isolate these functions in a separate utils file if they are needed elsewhere
async function loadProject(projectId, select = DEFAULT_SELECT) {
  if (!projectId) return null;
  return prisma.project.findUnique({
    where: { id: projectId },
    select,
  });
}

function ensureAccess(project, req) {
  const userId = req.user?.id ?? null;
  // if ownerId set and doesn't match current user -> forbidden
  if (project.ownerId && project.ownerId !== userId) return false;
  return true;
}

export async function viewProject(req, res) {
  try {
    const projectId = req.params.projectId;
    if (!projectId) {
      return res.status(400).render("error", {
        code: 400,
        message: "Bad Request",
        description: "Missing project id",
      });
    }

    const project = await loadProject(projectId);
    if (!project) {
      return res.status(404).render("error", {
        code: 404,
        message: "Not Found",
        description: "Project not found",
      });
    }

    if (!ensureAccess(project, req)) {
      return res.status(403).render("error", {
        code: 403,
        message: "Forbidden",
        description: "You do not have access to this project",
      });
    }

    // If this is a blog and not configured yet, send to configure flow
    const needsBlogConfigure =
      project.type === "blog" && !project.Blog?.gitConfig;
    if (needsBlogConfigure) {
      return res.redirect(302, `/p/${project.id}/configure`);
    }

    // TODO: load other project details, settings, etc.
    logger.debug("Render project page for project:", {
      id: project.id,
      type: project.type,
    });

    // placeholder while page is implemented
    return res.send("Project page - under construction");
  } catch (err) {
    logger.error("Render project page failed:", err);
    return res.status(500).render("error", {
      code: 500,
      message: "Oops!",
      description: "Failed to load project",
      error: err?.message || String(err),
    });
  }
}

export async function viewProjectConfigure(req, res) {
  try {
    const projectId = req.params.projectId;
    if (!projectId) {
      return res.status(400).render("error", {
        code: 400,
        message: "Bad Request",
        description: "Missing project id",
      });
    }

    const project = await loadProject(projectId, {
      id: true,
      name: true,
      type: true,
      Blog: { select: { projectId: true, gitConfig: true } },
    });

    if (!project) {
      return res.status(404).render("error", {
        code: 404,
        message: "Not found",
        description: "Project not found",
      });
    }

    if (!ensureAccess(project, req)) {
      return res.status(403).render("error", {
        code: 403,
        message: "Forbidden",
        description: "You do not have access to this project",
      });
    }

    // Only blogs have configuration flow. If already configured or not a blog, redirect to project.
    const alreadyConfigured = !!project.Blog?.gitConfig;
    if (project.type !== "blog" || alreadyConfigured) {
      return res.redirect(302, `/p/${project.id}`);
    }

    return res.render("project/blog/configure", { project });
  } catch (err) {
    logger.error("Load project configure failed:", err);
    return res.status(500).render("error", {
      code: 500,
      message: "Oops!",
      description: "Failed to load configuration",
      error: err?.message || String(err),
    });
  }
}
