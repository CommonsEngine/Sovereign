import { getProjectContext, formatDate } from "./_utils.js";

export default async function viewIndex(req, res, _, { prisma, logger, git }) {
  try {
    const projectId = req.params.id;
    if (!projectId) {
      return res.status(400).render("error", {
        code: 400,
        message: "Bad Request",
        description: "Missing project id",
      });
    }

    let context;
    try {
      context = await getProjectContext(req, projectId, {}, { prisma, logger });
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
        if (status >= 400 && status < 500) {
          return res.status(status).render("error", {
            code: status,
            message,
            description,
          });
        }
      }
      throw err;
    }

    const project = context.project;

    if (project.type === "blog") {
      // If this is a blog and not configured yet, send to configure flow
      const needsBlogConfigure = !project.blog?.gitConfig;
      if (needsBlogConfigure) {
        return res.redirect(302, `/${project.type}/${project.id}/configure`);
      }

      const gitConfig = project.blog?.gitConfig || null;

      // Try to use cached connection; if missing or broken, try to (re)connect once.
      let connected = false;
      try {
        const cached = git.getGitManager(project.id);
        if (cached) {
          await cached.pullLatest(); // quick connectivity check
          connected = true;
        } else {
          if (gitConfig) {
            await git.getOrInitGitManager(project.id, {
              repoUrl: gitConfig.repoUrl,
              branch: gitConfig.branch,
              userName: gitConfig.userName,
              userEmail: gitConfig.userEmail,
              authToken: gitConfig.authSecret || null,
            });
            connected = true;
          }
        }
      } catch {
        connected = false;
      }

      // If still not connected, reset config to avoid loop and redirect to configure
      if (!connected) {
        try {
          git.disposeGitManager(project.id);
          if (gitConfig?.id) {
            await prisma.gitConfig.delete({
              where: { id: gitConfig.id },
            });
          }
        } catch {
          // ignore if already deleted
        }
        // return res.redirect(302, `/${project.type}/${project.id}/configure`);
      }

      const created = formatDate(project.createdAt);
      const updated = formatDate(project.updatedAt);
      const projectView = {
        id: project.id,
        name: project.name,
        desc: project.desc || "",
        status: project.status || "draft",
        repoUrl: gitConfig?.repoUrl || "",
        branch: gitConfig?.branch || "main",
        contentDir: gitConfig?.contentDir || "",
        gitUserName: gitConfig?.userName || "",
        gitUserEmail: gitConfig?.userEmail || "",
        createdAtISO: created.iso,
        createdAtDisplay: created.label,
        updatedAtISO: updated.iso,
        updatedAtDisplay: updated.label,
      };

      const canViewShares = ["owner", "editor"].includes(context.role || "");
      const canManageShares = context.role === "owner";

      return res.render("blog/index", {
        project: projectView,
        connected,
        connect_error: !connected,
        share: {
          role: context.role,
          canView: canViewShares,
          canManage: canManageShares,
        },
      });
    }

    return res.status(404).render("error", {
      code: 404,
      message: "Not Found",
      description: "Project not found",
    });
  } catch (err) {
    logger.error("✗ Render project page failed:", err);
    return res.status(500).render("error", {
      code: 500,
      message: "Oops!",
      description: "Failed to load project",
      error: err?.message || String(err),
    });
  }
}
