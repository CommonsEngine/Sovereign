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

// TODO: Move this checks to platform level

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

class ProjectAccessError extends Error {
  constructor(message, status = 403, meta = {}) {
    super(message);
    this.name = "ProjectAccessError";
    this.status = status;
    this.meta = meta;
  }
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

function normalizeRoles(roles) {
  if (!roles) return [];
  if (Array.isArray(roles)) return roles.filter(Boolean);
  return [roles].filter(Boolean);
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

async function ensureProjectAccess(
  { projectId, user, allowedRoles = ["viewer"], select, emailOverride } = {},
  ctx
) {
  console.log("$ensureProjectAccess-1", ctx);
  const tx = ctx.prisma;

  if (!projectId) {
    throw new ProjectAccessError("Missing project id", 400);
  }

  const project = await tx.project.findUnique({
    where: { id: projectId },
    select: select ?? { id: true, type: true },
  });
  console.log("$ensureProjectAccess-2", project);
  if (!project) {
    throw new ProjectAccessError("Project not found", 404);
  }

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
    project,
    contribution,
    membership: contribution, // temporary alias for backward compatibility
    role: effectiveRole,
  };
}

// TODO: Simplify getProjectContext()
async function getProjectContext(req, projectId, options = {}, ctx = {}) {
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

export default async function getBlog(req, res, _, { prisma, logger, git }) {
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

      // Try to use cached connection; if missing or broken, try to (re)connect once.
      let connected = false;
      try {
        const cached = git.getGitManager(project.id);
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
            await git.getOrInitGitManager(project.id, {
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
          git.disposeGitManager(project.id);
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
}
