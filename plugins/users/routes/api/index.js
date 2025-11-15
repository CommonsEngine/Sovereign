import express from "express";

import {
  ensureTenantIds,
  hasTenantIntersection,
  loadTenantIdsForUser,
} from "../../utils/tenants.js";
import { USER_ROLE_KEYS } from "../../config/roles.js";

const CONTRIBUTOR_STATUS = {
  pending: "pending",
  active: "active",
  revoked: "revoked",
};

const MANAGEABLE_ROLE_KEYS = Array.isArray(USER_ROLE_KEYS) ? USER_ROLE_KEYS : [];

function userHasRole(user, roleKey) {
  if (!user || !Array.isArray(user.roles) || !roleKey) return false;
  const normalized = String(roleKey).toLowerCase();
  return user.roles.some(
    (role) => typeof role?.key === "string" && role.key.toLowerCase() === normalized
  );
}

async function syncProjectPrimaryOwner(projectId, { prisma }) {
  if (!projectId) return;

  const primaryOwner = await prisma.projectContributor.findFirst({
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

async function deleteUser(req, res, _, { prisma, logger, defaultTenantId }) {
  try {
    const { id } = req.params || {};
    const userId = typeof id === "string" ? id.trim() : "";
    if (!userId) {
      return res.status(400).json({ error: "Missing user id" });
    }
    if (req.user?.id === userId) {
      return res.status(400).json({ error: "You cannot delete your own account." });
    }

    const existing = await prisma.user.findUnique({
      where: { id: userId },
      select: { id: true },
    });
    if (!existing) {
      return res.status(404).json({ error: "User not found" });
    }

    const resolvedDefaultTenantId = defaultTenantId || "tenant-0";
    const isPlatformAdmin = userHasRole(req.user, "platform:admin");
    const isTenantAdmin = userHasRole(req.user, "tenant:admin");
    if (!isPlatformAdmin && isTenantAdmin) {
      const allowedTenantIds = ensureTenantIds(req.user?.tenantIds, resolvedDefaultTenantId);
      const targetTenantIds = await loadTenantIdsForUser(prisma, userId, resolvedDefaultTenantId);
      if (!hasTenantIntersection(targetTenantIds, allowedTenantIds)) {
        return res.status(403).json({ error: "Forbidden" });
      }
    }

    await prisma.$transaction(async (tx) => {
      const memberships = await tx.projectContributor.findMany({
        where: { userId },
        select: { projectId: true },
      });
      const projectIds = Array.from(new Set(memberships.map((m) => m.projectId)));

      await tx.projectContributor.deleteMany({ where: { userId } });

      await tx.user.update({
        where: { id: userId },
        data: { primaryEmailId: null },
      });
      await tx.session.deleteMany({ where: { userId } });
      await tx.userRoleAssignment.deleteMany({ where: { userId } });
      await tx.verificationToken.deleteMany({ where: { userId } });
      await tx.passwordResetToken.deleteMany({ where: { userId } });
      await tx.userEmail.deleteMany({ where: { userId } });
      await tx.userProfile.deleteMany({ where: { userId } });
      await tx.user.delete({ where: { id: userId } });

      for (const projectId of projectIds) {
        await syncProjectPrimaryOwner(projectId, { prisma });
      }
    });

    return res.status(204).end();
  } catch (err) {
    logger.error("✗ deleteUser failed:", err);
    return res.status(500).json({ error: "Failed to delete user" });
  }
}

async function updateUser(req, res, _, { prisma, logger, defaultTenantId }) {
  try {
    const { id } = req.params || {};
    const userId = typeof id === "string" ? id.trim() : "";
    if (!userId) {
      return res.status(400).json({ error: "Missing user id" });
    }

    const existing = await prisma.user.findUnique({
      where: { id: userId },
      select: { id: true },
    });
    if (!existing) {
      return res.status(404).json({ error: "User not found" });
    }

    const resolvedDefaultTenantId = defaultTenantId || "tenant-0";
    const isPlatformAdmin = userHasRole(req.user, "platform:admin");
    const isTenantAdmin = userHasRole(req.user, "tenant:admin");
    if (!isPlatformAdmin && isTenantAdmin) {
      const allowedTenantIds = ensureTenantIds(req.user?.tenantIds, resolvedDefaultTenantId);
      const targetTenantIds = await loadTenantIdsForUser(prisma, userId, resolvedDefaultTenantId);
      if (!hasTenantIntersection(targetTenantIds, allowedTenantIds)) {
        return res.status(403).json({ error: "Forbidden" });
      }
    }

    const firstName =
      typeof req.body?.firstName === "string" ? req.body.firstName.trim() : undefined;
    const lastName = typeof req.body?.lastName === "string" ? req.body.lastName.trim() : undefined;
    const rolesPayload = Array.isArray(req.body?.roles) ? req.body.roles : [];
    const normalizedRoles = Array.from(
      new Set(
        rolesPayload
          .map((value) => (typeof value === "string" ? value.trim().toLowerCase() : ""))
          .filter(Boolean)
      )
    ).filter((key) => MANAGEABLE_ROLE_KEYS.includes(key));

    const roleRecords =
      normalizedRoles.length > 0
        ? await prisma.userRole.findMany({
            where: { key: { in: normalizedRoles } },
            select: { id: true, key: true },
          })
        : [];

    await prisma.$transaction(async (tx) => {
      const updates = {};
      if (firstName !== undefined) {
        updates.firstName = firstName || null;
      }
      if (lastName !== undefined) {
        updates.lastName = lastName || null;
      }
      if (Object.keys(updates).length > 0) {
        await tx.user.update({
          where: { id: userId },
          data: updates,
        });
      }

      if (MANAGEABLE_ROLE_KEYS.length > 0) {
        await tx.userRoleAssignment.deleteMany({
          where: {
            userId,
            role: {
              key: { in: MANAGEABLE_ROLE_KEYS },
            },
          },
        });
        if (roleRecords.length) {
          await tx.userRoleAssignment.createMany({
            data: roleRecords.map((role) => ({
              userId,
              roleId: role.id,
            })),
          });
        }
      }
    });

    return res.status(200).json({ ok: true });
  } catch (err) {
    logger.error("✗ updateUser failed:", err);
    return res.status(500).json({ error: "Failed to update user" });
  }
}

export default (ctx) => {
  const router = express.Router();

  router.delete("/:id", (req, res, next) => {
    return deleteUser(req, res, next, ctx);
  });

  router.put("/:id", (req, res, next) => {
    return updateUser(req, res, next, ctx);
  });

  return router;
};
