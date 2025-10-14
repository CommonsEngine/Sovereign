import logger from "../../utils/logger.mjs";
import prisma from "../../prisma.mjs";
import { USER_ROLES } from "../../config/index.mjs";

// Helpers
function fmtDate(d) {
  try {
    const dt = new Date(d);
    const fmt = new Intl.DateTimeFormat("en-US", {
      year: "numeric",
      month: "short",
      day: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });
    return { iso: dt.toISOString(), text: fmt.format(dt) };
  } catch {
    return { iso: "", text: "" };
  }
}

export async function viewUsers(req, res) {
  try {
    const rawUsers = await prisma.user.findMany({
      select: {
        id: true,
        primaryEmail: { select: { email: true } },
        name: true,
        firstName: true,
        lastName: true,
        status: true,
        createdAt: true,
        roleAssignments: { select: { role: true } },
      },
      orderBy: { createdAt: "asc" },
    });

    // N+1 project assignment count per user (owner/admin/editor)
    const users = await Promise.all(
      rawUsers.map(async (u) => {
        const projects = await prisma.project.findMany({
          where: {
            OR: [{ ownerId: u.id }],
          },
          select: { id: true },
        });
        const assigned = new Set(projects.map((p) => p.id)).size;
        const { iso, text } = fmtDate(u.createdAt);

        return {
          id: u.id,
          email: u.primaryEmail?.email || "",
          username: u.name,
          displayName: `${u.firstName} ${u.lastName}`,
          roleLabel:
            u.roleAssignments.length > 0
              ? u.roleAssignments[0].role?.label
              : "unknown",
          status: u.status,
          projectsAssigned: assigned,
          createdAtISO: iso,
          createdAtDisplay: text,
        };
      }),
    );

    return res.render("users", {
      users,
      data: {
        // TODO: only show roles that are "lower" than the current user's highest role
        // E.g. platform_admin can assign any role, admin can assign editor/contributor/viewer, etc
        // For now, just show all roles
        // Also, do not show "automation_bot" roles in the dropdown
        roles: Object.keys(USER_ROLES)
          .reverse()
          .filter((r) => r !== "automation_bot")
          .map((r) => ({ value: r, label: USER_ROLES[r].label })),
      },
    });
  } catch (err) {
    logger.error("users view failed:", err);
    return res.status(500).render("error", {
      code: 500,
      message: "Oops!",
      description: "Failed to load users",
      error: err?.message || String(err),
    });
  }
}
