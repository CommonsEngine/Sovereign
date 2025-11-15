function normalizeTenantValue(value) {
  if (!value) return null;
  const asString = typeof value === "string" ? value : String(value);
  const trimmed = asString.trim();
  return trimmed || null;
}

export function ensureTenantIds(input, fallbackTenantId) {
  const tenantIds = new Set();

  if (Array.isArray(input)) {
    for (const candidate of input) {
      const normalized = normalizeTenantValue(candidate);
      if (normalized) {
        tenantIds.add(normalized);
      }
    }
  } else {
    const normalized = normalizeTenantValue(input);
    if (normalized) {
      tenantIds.add(normalized);
    }
  }

  if (tenantIds.size === 0 && fallbackTenantId) {
    tenantIds.add(fallbackTenantId);
  }

  return [...tenantIds];
}

export function tenantIdsFromContributions(contributions, fallbackTenantId) {
  if (!Array.isArray(contributions) || contributions.length === 0) {
    return ensureTenantIds([], fallbackTenantId);
  }

  const candidateIds = contributions
    .map((item) => item?.project?.tenantId)
    .filter((value) => typeof value === "string" && value.trim());

  return ensureTenantIds(candidateIds, fallbackTenantId);
}

export function hasTenantIntersection(userTenantIds = [], allowedTenantIds = []) {
  if (!Array.isArray(userTenantIds) || userTenantIds.length === 0) {
    return false;
  }

  const allowedSet =
    allowedTenantIds instanceof Set
      ? allowedTenantIds
      : new Set((Array.isArray(allowedTenantIds) ? allowedTenantIds : []).filter(Boolean));

  for (const tenantId of userTenantIds) {
    if (allowedSet.has(tenantId)) {
      return true;
    }
  }
  return false;
}

export async function loadTenantIdsForUser(prisma, userId, fallbackTenantId) {
  if (!prisma || !userId) {
    return ensureTenantIds([], fallbackTenantId);
  }

  const contributions = await prisma.projectContributor.findMany({
    where: { userId },
    select: {
      project: {
        select: {
          tenantId: true,
        },
      },
    },
  });

  const candidateIds = contributions
    .map((record) => record?.project?.tenantId)
    .filter((value) => typeof value === "string" && value.trim());

  return ensureTenantIds(candidateIds, fallbackTenantId);
}
