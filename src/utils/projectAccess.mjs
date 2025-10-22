import { prisma } from "$/services/database.mjs";

export const CONTRIBUTOR_ROLE_WEIGHT = {
  viewer: 1,
  editor: 2,
  owner: 3,
};

export const CONTRIBUTOR_STATUS = {
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

function normalizeRoles(roles) {
  if (!roles) return [];
  if (Array.isArray(roles)) return roles.filter(Boolean);
  return [roles].filter(Boolean);
}

export function isRoleAllowed(role, allowedRoles) {
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

export async function findActiveContribution(projectId, user, options = {}) {
  const { tx = prisma, emailOverride } = options;
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

export async function ensureProjectAccess({
  projectId,
  user,
  allowedRoles = ["viewer"],
  select,
  tx = prisma,
  emailOverride,
} = {}) {
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

  let contribution = await findActiveContribution(projectId, user, {
    tx,
    emailOverride,
  });
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

export async function listProjectContributors(projectId, options = {}) {
  const { tx = prisma } = options;
  if (!projectId) return [];
  return tx.projectContributor.findMany({
    where: { projectId },
    orderBy: [{ createdAt: "asc" }],
    select: {
      id: true,
      role: true,
      status: true,
      invitedAt: true,
      acceptedAt: true,
      invitedEmail: true,
      user: {
        select: {
          id: true,
          name: true,
          firstName: true,
          lastName: true,
          pictureUrl: true,
          primaryEmail: { select: { email: true } },
        },
      },
    },
  });
}

export async function syncProjectPrimaryOwner(projectId, options = {}) {
  const { tx = prisma } = options;
  if (!projectId) return;

  const primaryOwner = await tx.projectContributor.findFirst({
    where: {
      projectId,
      status: CONTRIBUTOR_STATUS.active,
      role: "owner",
      userId: { not: null },
    },
    orderBy: [{ invitedAt: "asc" }, { createdAt: "asc" }],
    select: { userId: true },
  });

  return primaryOwner?.userId ?? null;
}

// Deprecated aliases kept temporarily for compatibility with existing imports.
export const PROJECT_ROLE_WEIGHT = CONTRIBUTOR_ROLE_WEIGHT;
export const PROJECT_MEMBER_STATUS = CONTRIBUTOR_STATUS;
export const findActiveMembership = findActiveContribution;
export const listProjectMembers = listProjectContributors;
