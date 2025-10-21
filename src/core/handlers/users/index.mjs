import logger from "$/core/services/logger.mjs";
import prisma from "$/core/services/database.mjs";
import { USER_ROLES } from "$/core/config/index.mjs";
import { syncProjectPrimaryOwner } from "$/core/utils/projectAccess.mjs";

const DATE_FORMAT = new Intl.DateTimeFormat("en-US", {
  dateStyle: "medium",
  timeStyle: "short",
});
const RELATIVE_FORMAT = new Intl.RelativeTimeFormat("en", {
  numeric: "auto",
});

const STATUS_META = {
  active: {
    label: "Active",
    tone: "success",
    description: "User has completed setup and can sign in.",
  },
  invited: {
    label: "Invited",
    tone: "warning",
    description: "User invitation sent but not yet accepted.",
  },
  suspended: {
    label: "Suspended",
    tone: "danger",
    description: "User cannot sign in until reactivated.",
  },
};

function toDate(value) {
  if (!value) return null;
  const dt = value instanceof Date ? value : new Date(value);
  return Number.isNaN(dt.getTime()) ? null : dt;
}

function formatDateTime(value) {
  const dt = toDate(value);
  if (!dt) return { iso: "", display: "" };
  return { iso: dt.toISOString(), display: DATE_FORMAT.format(dt) };
}

function formatRelative(value) {
  const dt = toDate(value);
  if (!dt) return "";
  const diffSeconds = Math.round((dt.getTime() - Date.now()) / 1000);
  const thresholds = [
    { unit: "year", seconds: 31536000 },
    { unit: "month", seconds: 2592000 },
    { unit: "week", seconds: 604800 },
    { unit: "day", seconds: 86400 },
    { unit: "hour", seconds: 3600 },
    { unit: "minute", seconds: 60 },
    { unit: "second", seconds: 1 },
  ];

  for (const { unit, seconds } of thresholds) {
    if (Math.abs(diffSeconds) >= seconds || unit === "second") {
      const valueRounded = Math.round(diffSeconds / seconds);
      return RELATIVE_FORMAT.format(valueRounded, unit);
    }
  }
  return "";
}

function buildDisplayName(user) {
  const nameParts = [user.firstName, user.lastName]
    .filter(Boolean)
    .join(" ")
    .trim();
  if (nameParts) return nameParts;
  if (user.name) return user.name;
  if (user.primaryEmail?.email) return user.primaryEmail.email;
  return "User";
}

function formatPercent(part, total) {
  if (!total) return "0%";
  return `${Math.round((part / total) * 100)}%`;
}

export async function viewUsers(req, res) {
  try {
    const rawUsers = await prisma.user.findMany({
      include: {
        primaryEmail: { select: { email: true, isVerified: true } },
        emails: { select: { email: true, isPrimary: true, isVerified: true } },
        roleAssignments: {
          select: {
            assignedAt: true,
            role: {
              select: {
                id: true,
                key: true,
                label: true,
                level: true,
                scope: true,
                description: true,
              },
            },
          },
          orderBy: { assignedAt: "asc" },
        },
        verificationTokens: {
          where: { purpose: "invite" },
          orderBy: { createdAt: "desc" },
          take: 1,
          select: { createdAt: true, expiresAt: true },
        },
        sessions: {
          select: { createdAt: true },
          orderBy: { createdAt: "desc" },
          take: 1,
        },
        projectContributions: {
          where: { status: "active", role: "owner" },
          select: { projectId: true },
        },
      },
      orderBy: { createdAt: "asc" },
    });

    const users = rawUsers.map((user) => {
      const displayName = buildDisplayName(user);
      const primaryEmail =
        user.primaryEmail?.email ||
        user.emails.find((email) => email.isPrimary)?.email ||
        user.emails[0]?.email ||
        "";
      const emailVerified =
        user.primaryEmail?.isVerified ||
        user.emails.find((email) => email.isPrimary)?.isVerified ||
        false;

      const roles = (user.roleAssignments || []).map((assignment) => ({
        id: assignment.role.id,
        key: assignment.role.key,
        label: assignment.role.label,
        level: assignment.role.level,
        scope: assignment.role.scope,
        description: assignment.role.description,
        assignedAtISO: formatDateTime(assignment.assignedAt).iso,
        assignedAtRelative: formatRelative(assignment.assignedAt),
      }));

      const primaryRole = roles[0] || null;
      const extraRoles = roles.slice(1);
      const roleLabels = roles.map((role) => role.label).join(", ");
      const roleNames = roles.map((role) => role.label || role.key);
      const hasRoles = roles.length > 0;
      const primaryRoleLabel = roleNames[0] || "";
      const extraRoleCount = Math.max(roles.length - 1, 0);

      const statusInfo = STATUS_META[user.status] || {
        label: user.status,
        tone: "neutral",
        description: "",
      };

      const createdAt = formatDateTime(user.createdAt);
      const createdAtRelative = formatRelative(user.createdAt);

      const lastSession = user.sessions?.[0]?.createdAt || null;
      const lastSeen = formatDateTime(lastSession);
      const lastSeenRelative = formatRelative(lastSession);

      const inviteToken = user.verificationTokens?.[0] || null;
      const inviteSent = inviteToken
        ? formatDateTime(inviteToken.createdAt)
        : { iso: "", display: "" };
      const inviteSentRelative = inviteToken
        ? formatRelative(inviteToken.createdAt)
        : "";
      const inviteExpires = inviteToken
        ? formatDateTime(inviteToken.expiresAt)
        : { iso: "", display: "" };
      const inviteExpired = inviteToken
        ? toDate(inviteToken.expiresAt) < new Date()
        : false;
      const projectsOwned = user.projectContributions?.length ?? 0;
      const projectsAssigned = projectsOwned;
      const projectsSummary = `${projectsOwned} ${
        projectsOwned === 1 ? "project" : "projects"
      }`;

      return {
        id: user.id,
        username: user.name,
        displayName,
        initials: displayName
          .split(/\s+/)
          .map((part) => part[0])
          .join("")
          .slice(0, 2)
          .toUpperCase(),
        email: primaryEmail,
        emailVerified,
        status: user.status,
        statusLabel: statusInfo.label,
        statusTone: statusInfo.tone,
        statusDescription: statusInfo.description,
        projectsOwned,
        projectsAssigned,
        projectsSummary,
        roles,
        primaryRole,
        extraRoles,
        roleLabels,
        roleNames,
        hasRoles,
        primaryRoleLabel,
        extraRoleCount,
        createdAtISO: createdAt.iso,
        createdAtDisplay: createdAt.display,
        createdAtRelative,
        lastSeenISO: lastSeen.iso,
        lastSeenDisplay: lastSeen.display,
        lastSeenRelative,
        inviteSentISO: inviteSent.iso,
        inviteSentDisplay: inviteSent.display,
        inviteSentRelative,
        inviteExpiresISO: inviteExpires.iso,
        inviteExpired,
      };
    });

    const totals = users.reduce(
      (acc, user) => {
        acc.total += 1;
        if (user.status === "active") acc.active += 1;
        if (user.status === "invited") acc.invited += 1;
        if (user.status === "suspended") acc.suspended += 1;
        return acc;
      },
      { total: 0, active: 0, invited: 0, suspended: 0 },
    );

    const stats = [
      {
        key: "total",
        label: "Total users",
        value: totals.total,
        caption: totals.total ? "100%" : "0%",
      },
      {
        key: "active",
        label: "Active",
        value: totals.active,
        caption: formatPercent(totals.active, totals.total),
      },
      {
        key: "invited",
        label: "Invited",
        value: totals.invited,
        caption: formatPercent(totals.invited, totals.total),
      },
      {
        key: "suspended",
        label: "Suspended",
        value: totals.suspended,
        caption: formatPercent(totals.suspended, totals.total),
      },
    ];

    return res.render("users", {
      users,
      stats,
      statusFilters: Object.entries(STATUS_META).map(([value, meta]) => ({
        value,
        label: meta.label,
        tone: meta.tone,
      })),
      data: {
        // TODO: only show roles that are "lower" than the current user's highest role
        // E.g. platform:admin can assign any role, project:admin can assign editor/contributor/viewer, etc
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

export async function deleteUser(req, res) {
  try {
    const { id } = req.params || {};
    const userId = typeof id === "string" ? id.trim() : "";
    if (!userId) {
      return res.status(400).json({ error: "Missing user id" });
    }
    if (req.user?.id === userId) {
      return res
        .status(400)
        .json({ error: "You cannot delete your own account." });
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
      const projectIds = Array.from(
        new Set(memberships.map((m) => m.projectId)),
      );

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
        await syncProjectPrimaryOwner(projectId, { tx });
      }
    });

    return res.status(204).end();
  } catch (err) {
    logger.error("deleteUser failed:", err);
    return res.status(500).json({ error: "Failed to delete user" });
  }
}
