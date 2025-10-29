import { getProjectContext } from "../_utils.js";

export default async function viewProjectConfigure(req, res, _, { prisma, logger }) {
  try {
    const projectId = req.params.id;
    if (!projectId) {
      return res.status(400).render("error", {
        code: 400,
        message: "Bad Request",
        description: "Missing project id",
      });
    }

    let access;
    try {
      access = await getProjectContext(
        req,
        projectId,
        {
          roles: ["owner"],
          select: {
            id: true,
            name: true,
            type: true,
            blog: {
              select: {
                id: true,
                projectId: true,
                gitConfig: {
                  select: {
                    repoUrl: true,
                    branch: true,
                    contentDir: true,
                    userName: true,
                    userEmail: true,
                  },
                },
              },
            },
          },
        },
        { prisma, logger }
      );
    } catch (err) {
      if (err?.name === "ProjectAccessError") {
        const status = err.status ?? 403;
        const message = status === 404 ? "Not Found" : status === 400 ? "Bad Request" : "Forbidden";
        const description =
          status === 404
            ? "Project not found"
            : status === 400
              ? err.message || "Invalid request"
              : "You do not have access to this project";
        return res.status(status).render("error", {
          code: status,
          message,
          description,
        });
      }
      throw err;
    }

    const project = access.project;

    // Only blogs have configuration flow. If already configured or not a blog, redirect to project.
    const alreadyConfigured = !!project.blog?.gitConfig;
    if (project.type !== "blog" || alreadyConfigured) {
      return res.redirect(302, `/blog/${project.id}`);
    }

    return res.render("blog/configure", {
      project,
      gitConfig: project.blog?.gitConfig || null,
    });
  } catch (err) {
    logger.error("✗ Load project configure failed:", err);
    return res.status(500).render("error", {
      code: 500,
      message: "Oops!",
      description: "Failed to load configuration",
      error: err?.message || String(err),
    });
  }
}
