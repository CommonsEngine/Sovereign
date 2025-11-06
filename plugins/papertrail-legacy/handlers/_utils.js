// Helpers (TODO: Move to a shared util)
const DATE_FORMAT = new Intl.DateTimeFormat("en-US", {
  dateStyle: "medium",
  timeStyle: "short",
});

export function formatDate(value) {
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

export class ProjectAccessError extends Error {
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
    select: select ?? { id: true, type: true },
  });
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
