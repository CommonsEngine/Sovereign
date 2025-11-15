import { prisma } from "$/services/database.js";

function normalizeTenantValue(value) {
  if (!value) return null;
  const asString = typeof value === "string" ? value : String(value);
  const trimmed = asString.trim();
  return trimmed || null;
}

export function ensureTenantIds(input, fallbackTenantId) {
  const tenantIds = new Set();
  if (Array.isArray(input)) {
    for (const raw of input) {
      const normalized = normalizeTenantValue(raw);
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

export async function resolveTenantIdsForUserId(userId, fallbackTenantId) {
  if (!userId) {
    return ensureTenantIds([], fallbackTenantId);
  }

  const memberships = await prisma.projectContributor.findMany({
    where: { userId },
    select: {
      project: {
        select: {
          tenantId: true,
        },
      },
    },
  });

  const collected = memberships
    .map((record) => record?.project?.tenantId)
    .filter((value) => typeof value === "string" && value.trim());

  return ensureTenantIds(collected, fallbackTenantId);
}
