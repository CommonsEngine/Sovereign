import express from "express";

const CONTRIBUTOR_STATUS = {
  pending: "pending",
  active: "active",
  revoked: "revoked",
};

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

async function deleteUser(req, res, _, { prisma, logger }) {
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

export default (ctx) => {
  const router = express.Router();

  router.delete("/:id", (req, res, next) => {
    return deleteUser(req, res, next, ctx);
  });

  return router;
};
