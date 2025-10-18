import prisma from "$/prisma.mjs";

export const PROJECT_ROLE_WEIGHT = {
  viewer: 1,
  editor: 2,
  owner: 3,
};

export const PROJECT_MEMBER_STATUS = {
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
    .map((r) => PROJECT_ROLE_WEIGHT[r] ?? null)
    .filter((w) => typeof w === "number");
  if (!weights.length) return false;

  const minRequired = Math.min(...weights);
  const roleWeight = PROJECT_ROLE_WEIGHT[role] ?? 0;
  return roleWeight >= minRequired;
}

function membershipLookupConditions(user, { emailOverride } = {}) {
  const conditions = [];
  if (user?.id) conditions.push({ userId: user.id });
  const email =
    typeof emailOverride === "string"
      ? emailOverride.trim().toLowerCase()
      : (user?.email?.toLowerCase?.() ?? null);
  if (email) conditions.push({ invitedEmail: email });
  return conditions;
}

export async function findActiveMembership(projectId, user, options = {}) {
  const { tx = prisma, emailOverride } = options;
  if (!projectId) return null;
  const or = membershipLookupConditions(user, { emailOverride });
  if (!or.length) return null;

  return tx.projectMember.findFirst({
    where: {
      projectId,
      status: PROJECT_MEMBER_STATUS.active,
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
    select: select ?? { id: true, ownerId: true, type: true },
  });
  if (!project) {
    throw new ProjectAccessError("Project not found", 404);
  }

  let membership = await findActiveMembership(projectId, user, {
    tx,
    emailOverride,
  });
  let effectiveRole = membership?.role ?? null;

  if (!membership && project.ownerId && project.ownerId === user?.id) {
    // Backwards compatibility fallback until ownerId is fully retired
    effectiveRole = "owner";
  }

  if (!isRoleAllowed(effectiveRole, allowedRoles)) {
    throw new ProjectAccessError("Forbidden", 403, {
      projectId,
      allowedRoles,
      effectiveRole,
    });
  }

  return {
    project,
    membership,
    role: effectiveRole,
  };
}

export async function listProjectMembers(projectId, options = {}) {
  const { tx = prisma } = options;
  if (!projectId) return [];
  return tx.projectMember.findMany({
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

  const primaryOwner = await tx.projectMember.findFirst({
    where: {
      projectId,
      status: PROJECT_MEMBER_STATUS.active,
      role: "owner",
      userId: { not: null },
    },
    orderBy: [{ invitedAt: "asc" }, { createdAt: "asc" }],
    select: { userId: true },
  });

  await tx.project.update({
    where: { id: projectId },
    data: { ownerId: primaryOwner?.userId ?? null },
  });
}
