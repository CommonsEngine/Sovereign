import logger from "$/utils/logger.mjs";
import prisma from "$/prisma.mjs";

export default async function getAll(req, res) {
  try {
    const userId = req.user?.id;
    const email = req.user?.email
      ? String(req.user.email).trim().toLowerCase()
      : null;
    const membershipConditions = [];
    if (userId) membershipConditions.push({ userId });
    if (email) membershipConditions.push({ invitedEmail: email });

    const projectsRaw = await prisma.project.findMany({
      where: {
        OR: [
          { ownerId: null },
          { ownerId: userId },
          membershipConditions.length
            ? {
                contributors: {
                  some: {
                    status: "active",
                    OR: membershipConditions,
                  },
                },
              }
            : undefined,
        ].filter(Boolean),
      },
      select: {
        ownerId: true,
        id: true,
        type: true,
        name: true,
        desc: true,
        scope: true,
        status: true,
        createdAt: true,
        updatedAt: true,
        contributors: {
          where: { status: "active" },
          select: {
            userId: true,
            role: true,
          },
        },
      },
    });
    const projects = projectsRaw
      .map((p) => ({
        ...p,
        owned:
          p.ownerId === userId ||
          p.contributors.some(
            (member) => member.userId === userId && member.role === "owner",
          ),
        shared:
          (p.contributors?.length ?? 0) > 1 ||
          p.contributors.some(
            (member) =>
              member.role !== "owner" ||
              (member.role === "owner" && member.userId !== userId),
          ) ||
          p.ownerId === null,
      }))
      .sort((a, b) => b.createdAt - a.createdAt /* newest first */)
      .map((p) => ({
        ...p,
        ownerId: undefined,
        contributors: undefined,
      }));
    return res.json({ projects });
  } catch (error) {
    logger.error("Failed to get projects:", error);
    return res.status(500).json({ error: "Failed to get projects" });
  }
}
