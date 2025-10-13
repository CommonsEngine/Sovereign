import logger from "../../utils/logger.mjs";
import prisma from "../../prisma.mjs";

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

function roleLabel(role) {
  switch (role) {
    case 0:
      return "owner";
    case 1:
      return "admin";
    case 2:
      return "editor";
    case 3:
      return "contributor";
    case 4:
      return "viewer";
    case 9:
      return "guest";
    default:
      return "unknown";
  }
}

export async function viewUsers(req, res) {
  try {
    const rawUsers = await prisma.user.findMany({
      select: {
        id: true,
        email: true,
        username: true,
        displayName: true,
        role: true,
        status: true,
        createdAt: true,
      },
      orderBy: { createdAt: "asc" },
    });

    // N+1 project assignment count per user (owner/admin/editor)
    const users = await Promise.all(
      rawUsers.map(async (u) => {
        const projects = await prisma.project.findMany({
          where: {
            OR: [
              { ownerId: u.id },
              { admins: { some: { id: u.id } } },
              { editors: { some: { id: u.id } } },
            ],
          },
          select: { id: true },
        });
        const assigned = new Set(projects.map((p) => p.id)).size;
        const name = u.displayName || u.username || u.email;
        const { iso, text } = fmtDate(u.createdAt);
        return {
          id: u.id,
          email: u.email,
          username: u.username,
          displayName: name,
          roleLabel: roleLabel(u.role),
          status: u.status,
          projectsAssigned: assigned,
          createdAtISO: iso,
          createdAtDisplay: text,
        };
      }),
    );

    return res.render("users", { users });
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
