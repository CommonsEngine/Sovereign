import express from "express";

const CONTRIBUTOR_ROLE_WEIGHT = {
  viewer: 1,
  editor: 2,
  owner: 3,
};

const CONTRIBUTOR_STATUS = {
  pending: "pending",
  active: "active",
  revoked: "revoked",
};

const RELATION_SELECT_MAP = {
  blog: "Blog",
  papertrail: "PapertrailBoard",
};

const RELATION_RESULT_MAP = {
  Blog: "blog",
  PapertrailBoard: "papertrail",
};

const renameSelectKey = (key) => RELATION_SELECT_MAP[key] || key;

function normalizeSelectionShape(node) {
  if (!node || typeof node !== "object") return node;
  if (Array.isArray(node)) {
    return node.map((item) => normalizeSelectionShape(item));
  }
  const normalized = {};
  for (const [key, val] of Object.entries(node)) {
    const nextKey = renameSelectKey(key);
    normalized[nextKey] =
      typeof val === "object" && val !== null ? normalizeSelectionShape(val) : val;
  }
  return normalized;
}

function normalizeProjectResult(project) {
  if (!project || typeof project !== "object") return project;
  const normalized = { ...project };
  for (const [dbKey, alias] of Object.entries(RELATION_RESULT_MAP)) {
    if (Object.prototype.hasOwnProperty.call(normalized, dbKey)) {
      if (!Object.prototype.hasOwnProperty.call(normalized, alias)) {
        normalized[alias] = normalized[dbKey];
      }
      delete normalized[dbKey];
    }
  }
  return normalized;
}

function normalizeRoles(roles) {
  if (!roles) return [];
  if (Array.isArray(roles)) return roles.filter(Boolean);
  return [roles].filter(Boolean);
}

function contributorLookupConditions(user, { emailOverride } = {}) {
  const conditions = [];
  if (user?.id) conditions.push({ userId: user.id });
  const email =
    typeof emailOverride === "string"
      ? emailOverride.trim().toLowerCase()
      : (user?.email?.toLowerCase?.() ?? null);
  if (email) conditions.push({ invitedEmail: email });
  return conditions;
}

export class ProjectAccessError extends Error {
  constructor(message, status = 403, meta = {}) {
    super(message);
    this.name = "ProjectAccessError";
    this.status = status;
    this.meta = meta;
  }
}

async function findActiveContribution(projectId, user, options = {}, context) {
  const { tx = context.prisma, emailOverride } = options;
  if (!projectId) return null;
  const or = contributorLookupConditions(user, { emailOverride });
  if (!or.length) return null;

  return tx.projectContributor.findFirst({
    where: {
      projectId,
      status: CONTRIBUTOR_STATUS.active,
      OR: or,
    },
  });
}

function isRoleAllowed(role, allowedRoles) {
  const normalized = normalizeRoles(allowedRoles);
  if (!normalized.length) return false;
  if (!role) return false;

  if (normalized.includes(role)) return true;

  const weights = normalized
    .map((r) => CONTRIBUTOR_ROLE_WEIGHT[r] ?? null)
    .filter((w) => typeof w === "number");
  if (!weights.length) return false;

  const minRequired = Math.min(...weights);
  const roleWeight = CONTRIBUTOR_ROLE_WEIGHT[role] ?? 0;
  return roleWeight >= minRequired;
}

export async function ensureProjectAccess(
  { projectId, user, allowedRoles = ["viewer"], select, emailOverride } = {},
  ctx
) {
  const tx = ctx.prisma;

  if (!projectId) {
    throw new ProjectAccessError("Missing project id", 400);
  }

  const project = await tx.project.findUnique({
    where: { id: projectId },
    select: select ? normalizeSelectionShape(select) : { id: true, type: true },
  });
  if (!project) {
    throw new ProjectAccessError("Project not found", 404);
  }
  const normalizedProject = normalizeProjectResult(project);

  let contribution = await findActiveContribution(
    projectId,
    user,
    {
      tx,
      emailOverride,
    },
    ctx
  );
  let effectiveRole = contribution?.role ?? null;

  if (!isRoleAllowed(effectiveRole, allowedRoles)) {
    throw new ProjectAccessError("Forbidden", 403, {
      projectId,
      allowedRoles,
      effectiveRole,
    });
  }

  return {
    project: normalizedProject,
    contribution,
    membership: contribution, // temporary alias for backward compatibility
    role: effectiveRole,
  };
}

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

export async function getProjectContext(req, projectId, options = {}, ctx = {}) {
  const {
    select = {
      id: true,
      name: true,
      desc: true,
      type: true,
      status: true,
      createdAt: true,
      updatedAt: true,
      papertrail: {
        select: PAPERTRAIL_BOARD_SELECT,
      },
    },
    roles = ["viewer"],
  } = options;
  return ensureProjectAccess(
    {
      projectId,
      user: req.user,
      allowedRoles: roles,
      select,
    },
    ctx
  );
}

export default (ctx) => {
  const router = express.Router();

  const { logger, uuid, prisma } = ctx;

  router.get("/:id", async (req, res) => {
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
        context = await getProjectContext(req, projectId, {}, ctx);
      } catch (err) {
        if (err?.name === "ProjectAccessError") {
          const status = err.status ?? 403;
          const message =
            status === 404 ? "Not Found" : status === 400 ? "Bad Request" : "Forbidden";
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
          logger.error("✗ Failed to ensure papertrail board exists", err);
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
      logger.error("✗ Render project page failed:", err);
      return res.status(500).render("error", {
        code: 500,
        message: "Oops!",
        description: "Failed to load project",
        error: err?.message || String(err),
      });
    }
  });

  return router;
};
