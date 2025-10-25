// TODO: Recieve git, prisma, logger etc as DI via context
import { prisma } from "$/services/database.mjs";
import logger from "$/services/logger.mjs";
import {
  getOrInitGitManager,
  getGitManager,
  disposeGitManager,
} from "$/libs/git/registry.mjs";
import { ensureProjectAccess } from "$/utils/projectAccess.mjs";

import apiRoutes from "./routes/api.mjs";
import webRoutes from "./routes/web.mjs";

/**
 * Plugin: Route registry
 * ----------------------
 * Exposes the plugin's Express routers to the Sovereign extension host.
 * - web: non-API routes (e.g., SSR pages)
 * - api: REST or GraphQL endpoints for plugin data operations
 *
 * The extension host mounts these under a plugin-specific base path,
 * e.g., `/api/<plugin-namespace>` for API and `/<plugin-namespace>` for web.
 *
 * This object should remain declarative and side-effect free.
 */
export const routes = { web: webRoutes, api: apiRoutes };

// Helpers (TODO: Move to a shared util)
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
// End of utils

// TODO: Simplify getProjectContext()
async function getProjectContext(req, projectId, options = {}) {
  const {
    select = {
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
    },
    roles = ["viewer"],
  } = options;
  return ensureProjectAccess({
    projectId,
    user: req.user,
    allowedRoles: roles,
    select,
  });
}

/**
 * render
 * ------
 * Handles server-rendered index view for the plugin (if applicable).
 *
 * Typical Flow
 * 1) Resolve and authorize request context
 * 2) Prepare or fetch data relevant to the view
 * 3) Render a Handlebars or React SSR template with that data
 *
 * Parameters
 * - _: (reserved for dependency injection; receives context in future)
 * - resolve(fn): wrapper that produces an Express route handler
 *
 * Returns
 * - Express handler that renders a view or error template.
 *
 * Notes
 * - This is optional; plugins without UI can omit it.
 * - Avoid leaking secrets or raw config into templates.
 */
export async function render(_, resolve) {
  return resolve(async (req, res) => {
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
        context = await getProjectContext(req, projectId);
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
  });
}
