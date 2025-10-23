// TODO: Recieve git, prisma, logger etc as DI via context
import { prisma } from "$/services/database.mjs";
import logger from "$/services/logger.mjs";
import { ensureProjectAccess } from "$/utils/projectAccess.mjs";
import { uuid } from "$/utils/id.mjs";

import apiRoutes from "./routes/api.mjs";

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
export const routes = { web: undefined, api: apiRoutes };

/**
 * configure
 * ---------
 * Handles initial setup or configuration tasks for the plugin.
 *
 * Typical Responsibilities
 * - Validate input parameters and access rights
 * - Initialize any external integrations or resources
 * - Persist configuration state or credentials to the database
 *
 * Security
 * - Restrict to authorized roles (e.g., owner/admin)
 * - Avoid echoing sensitive data (tokens, secrets) in responses
 *
 * Parameters
 * - _: (reserved for dependency injection; receives context in future)
 * - resolve(fn): wrapper provided by the runtime that transforms async logic
 *   into an Express handler `(req, res) => Promise<void>`
 *
 * Returns
 * - Express handler responding with JSON status or error payloads.
 *
 * Notes
 * - Should log meaningful messages for diagnostics
 * - Keep implementation stateless; rely on DI context instead of imports later
 *
 * export async function configure(_, resolve) {
 *  return resolve((req, res) => {
 *    return res.json({})
 *  });
 * }
 */

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

async function getProjectAccessContext(req, projectId, options = {}) {
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
      papertrail: {
        select: PAPERTRAIL_BOARD_SELECT,
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
    } catch (err) {
      logger.error("Render project page failed:", err);
      return res.status(500).render("error", {
        code: 500,
        message: "Oops!",
        description: "Failed to load project",
        error: err?.message || String(err),
      });
    }
  });
}
