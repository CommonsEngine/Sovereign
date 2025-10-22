import { prisma } from "$/services/database.mjs";
import {
  getGitManager,
  getOrInitGitManager,
  disposeGitManager,
} from "$/libs/git/registry.mjs";
import logger from "$/utils/logger.mjs";
import { ensureProjectAccess } from "$/utils/projectAccess.mjs";
import { uuid } from "$/utils/id.mjs";

export { default as create } from "./core/create.mjs";
export { default as getAll } from "./core/getAll.mjs";
export { default as update } from "./core/update.mjs";
export { default as remove } from "./core/remove.mjs";

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

    // TODO: Refer `configure()` from plugins/blog/index.mjs
    if (project.type === "blog") {
      // If this is a blog and not configured yet, send to configure flow
      const needsBlogConfigure = !project.blog?.gitConfig;
      if (needsBlogConfigure) {
        return res.redirect(302, `/${project.type}/${project.id}/configure`);
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
        // return res.redirect(302, `/${project.type}/${project.id}/configure`);
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

      return res.render(`${project.type}/index`, {
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

      return res.render(`${project.type}/index`, {
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
