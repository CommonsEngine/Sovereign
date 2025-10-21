import {
  getGitManager,
  getOrInitGitManager,
  disposeGitManager,
} from "$/core/libs/git/registry.mjs";
import logger from "$/core/services/logger.mjs";
import prisma from "$/core/services/database.mjs";
import { ensureProjectAccess } from "$/core/utils/projectAccess.mjs";
import { uuid } from "$/core/utils/id.mjs";

export { default as create } from "./core/create.mjs";
export { default as getAll } from "./core/getAll.mjs";
export { default as update } from "./core/update.mjs";
export { default as remove } from "./core/remove.mjs";

export * as blog from "./blog/index.mjs";
export * as papertrail from "./papertrail/index.mjs";

const DATE_FORMAT = new Intl.DateTimeFormat("en-US", {
  dateStyle: "medium",
  timeStyle: "short",
});

function formatDate(value) {
  try {
    const dt = new Date(value);
    if (Number.isNaN(dt.getTime())) return { iso: "", label: "" };
    return { iso: dt.toISOString(), label: DATE_FORMAT.format(dt) };
  } catch {
    return { iso: "", label: "" };
  }
}

const PAPERTRAIL_BOARD_SELECT = {
  id: true,
  projectId: true,
  title: true,
  schemaVersion: true,
  layout: true,
  meta: true,
  createdAt: true,
  updatedAt: true,
  _count: {
    select: {
      nodes: true,
      edges: true,
    },
  },
};

const DEFAULT_SELECT = {
  id: true,
  name: true,
  desc: true,
  type: true,
  status: true,
  createdAt: true,
  updatedAt: true,
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
  papertrail: {
    select: PAPERTRAIL_BOARD_SELECT,
  },
};

async function getProjectAccessContext(req, projectId, options = {}) {
  const { select = DEFAULT_SELECT, roles = ["viewer"] } = options;
  return ensureProjectAccess({
    projectId,
    user: req.user,
    allowedRoles: roles,
    select,
  });
}

export async function configureProject(req, res) {
  try {
    const projectId = req.params.id;
    logger.log("Configuring blog for project: >>", projectId);
    if (!projectId) {
      return res.status(400).json({ error: "Missing project id" });
    }

    const blog = await prisma.blog.findUnique({
      where: { projectId },
      select: {
        id: true,
        projectId: true,
        gitConfig: true,
        project: { select: { id: true } },
      },
    });

    if (!blog) {
      return res.status(404).json({ error: "Unsupported project type" });
    }
    if (blog?.gitConfig) {
      return res.status(400).json({ error: "Blog already configured" });
    }

    await ensureProjectAccess({
      projectId,
      user: req.user,
      allowedRoles: ["owner"],
    });

    const raw = req.body || {};

    const repoUrl = String(raw.repoUrl || "").trim();
    if (!repoUrl)
      return res.status(400).json({ error: "Repository URL is required" });

    const branch = (
      String(raw.branch || raw.defaultBranch || "main").trim() || "main"
    ).slice(0, 80);
    const contentDirRaw =
      typeof raw.contentDir === "string" ? raw.contentDir : "";
    const contentDir = contentDirRaw.trim().slice(0, 200) || null;
    const gitUserName =
      typeof raw.gitUserName === "string"
        ? raw.gitUserName.trim().slice(0, 120)
        : null;
    const gitUserEmail =
      typeof raw.gitUserEmail === "string"
        ? raw.gitUserEmail.trim().slice(0, 120)
        : null;
    const gitAuthToken =
      typeof raw.gitAuthToken === "string" ? raw.gitAuthToken.trim() : null;

    // 1) Validate by connecting once and prime the in-memory connection
    try {
      await getOrInitGitManager(projectId, {
        repoUrl,
        branch,
        gitUserName,
        gitUserEmail,
        gitAuthToken,
      });
    } catch (err) {
      logger.error("Git connect/validate failed:", err);
      return res.status(400).json({
        error:
          "Failed to connect to repository. Please verify the repo URL, branch, and access token.",
      });
    }

    // 2) Save configuration
    // map to Prisma model field names
    const gitConfigPayload = {
      provider: "github",
      repoUrl,
      branch,
      contentDir,
      authType: "ssh",
      authSecret: gitAuthToken,
      userName: gitUserName, // model field is userName
      userEmail: gitUserEmail, // model field is userEmail
    };

    await prisma.gitConfig.upsert({
      where: { blogId: blog.id },
      create: { blogId: blog.id, ...gitConfigPayload },
      update: gitConfigPayload,
    });

    return res.json({ configured: true, gitConfigPayload });
  } catch (err) {
    logger.error("Configure blog failed:", err);
    return res.status(500).json({ error: "Failed to configure blog" });
  }
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

    let context;
    try {
      context = await getProjectAccessContext(req, projectId);
    } catch (err) {
      if (err?.name === "ProjectAccessError") {
        const status = err.status ?? 403;
        const message =
          status === 404
            ? "Not Found"
            : status === 400
              ? "Bad Request"
              : "Forbidden";
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
        return res.redirect(302, `/p/${project.id}/configure`);
      }

      // Try to use cached connection; if missing or broken, try to (re)connect once.
      let connected = false;
      try {
        const cached = getGitManager(project.id);
        if (cached) {
          await cached.pullLatest(); // quick connectivity check
          connected = true;
        } else {
          const cfg = await prisma.gitConfig.findUnique({
            where: { blogId: project.blog.id },
            select: {
              repoUrl: true,
              branch: true,
              userName: true,
              userEmail: true,
              authSecret: true,
            },
          });
          if (cfg) {
            await getOrInitGitManager(project.id, {
              repoUrl: cfg.repoUrl,
              branch: cfg.branch,
              userName: cfg.userName,
              userEmail: cfg.userEmail,
              authToken: cfg.authSecret || null,
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
          disposeGitManager(project.id);
          await prisma.gitConfig.delete({
            where: { blogId: project.blog.id },
          });
        } catch {
          // ignore if already deleted
        }
        // return res.redirect(302, `/p/${project.id}/configure`);
      }

      const gitConfig = project.blog?.gitConfig || null;

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

      return res.render("project/blog/index", {
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

    if (project.type === "papertrail") {
      let board = project.papertrail;

      if (!board) {
        try {
          board = await prisma.papertrailBoard.upsert({
            where: { projectId: project.id },
            create: {
              id: uuid("ptb_"),
              projectId: project.id,
              title: project.name,
              schemaVersion: 1,
              meta: {},
            },
            update: {},
            select: PAPERTRAIL_BOARD_SELECT,
          });
        } catch (err) {
          logger.error("Failed to ensure papertrail board exists", err);
          throw err;
        }
      }

      const created = formatDate(project.createdAt);
      const updated = formatDate(project.updatedAt);
      const boardCreated = board ? formatDate(board.createdAt) : null;
      const boardUpdated = board ? formatDate(board.updatedAt) : null;

      const boardPayload = board
        ? {
            id: board.id,
            projectId: board.projectId,
            title: board.title,
            schemaVersion: board.schemaVersion,
            layout: board.layout || null,
            meta: board.meta ?? {},
            createdAtISO: boardCreated?.iso ?? "",
            createdAtDisplay: boardCreated?.label ?? "",
            updatedAtISO: boardUpdated?.iso ?? "",
            updatedAtDisplay: boardUpdated?.label ?? "",
            stats: {
              nodes: board._count?.nodes ?? 0,
              edges: board._count?.edges ?? 0,
            },
          }
        : null;

      const projectView = {
        id: project.id,
        name: project.name,
        desc: project.desc || "",
        status: project.status || "draft",
        createdAtISO: created.iso,
        createdAtDisplay: created.label,
        updatedAtISO: updated.iso,
        updatedAtDisplay: updated.label,
      };

      const canEditShares = ["owner", "editor"].includes(context.role || "");
      const canManageShares = context.role === "owner";
      const canViewShares = canEditShares || context.role === "viewer";

      return res.render("project/papertrail/index", {
        project: projectView,
        board: boardPayload,
        boardJson: boardPayload
          ? JSON.stringify(boardPayload, null, 2)
              .replace(/</g, "\\u003c")
              .replace(/>/g, "\\u003e")
              .replace(/&/g, "\\u0026")
          : "null",
        share: {
          role: context.role,
          canView: canViewShares,
          canManage: canManageShares,
          canEdit: canEditShares,
        },
      });
    }

    return res.status(404).render("error", {
      code: 404,
      message: "Not Found",
      description: "Project not found",
    });
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

    let access;
    try {
      access = await getProjectAccessContext(req, projectId, {
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
      });
    } catch (err) {
      if (err?.name === "ProjectAccessError") {
        const status = err.status ?? 403;
        const message =
          status === 404
            ? "Not Found"
            : status === 400
              ? "Bad Request"
              : "Forbidden";
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
      return res.redirect(302, `/p/${project.id}`);
    }

    return res.render("project/blog/configure", {
      project,
      gitConfig: project.blog?.gitConfig || null,
    });
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
