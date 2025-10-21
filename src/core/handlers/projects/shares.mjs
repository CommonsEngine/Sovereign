import prisma from "$/core/services/database.mjs";
import logger from "$/core/services/logger.mjs";
import { uuid } from "$/core/utils/id.mjs";
import {
  ensureProjectAccess,
  ProjectAccessError,
  syncProjectPrimaryOwner,
} from "$/core/utils/projectAccess.mjs";

const VALID_ROLES = new Set(["owner", "editor", "viewer"]);
const MUTABLE_STATUSES = new Set(["active", "pending", "revoked"]);

const MEMBER_SELECT = {
  id: true,
  projectId: true,
  userId: true,
  invitedEmail: true,
  role: true,
  status: true,
  invitedAt: true,
  acceptedAt: true,
  note: true,
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
};

class ProjectShareError extends Error {
  constructor(status, message) {
    super(message);
    this.name = "ProjectShareError";
    this.status = status;
  }
}

function normalizeEmail(value) {
  if (!value) return null;
  if (typeof value !== "string") return null;
  const trimmed = value.trim().toLowerCase();
  if (!trimmed) return null;
  return trimmed;
}

function buildMemberPayload(member, currentUser) {
  if (!member) return null;

  const currentUserId = currentUser?.id ?? null;
  const currentEmail = normalizeEmail(currentUser?.email ?? null);

  const baseEmail =
    member.invitedEmail || member.user?.primaryEmail?.email || null;
  const email = baseEmail ? normalizeEmail(baseEmail) : null;
  const firstName = member.user?.firstName?.trim() || "";
  const lastName = member.user?.lastName?.trim() || "";
  const nameParts = [firstName, lastName].filter(Boolean);
  const displayName =
    nameParts.join(" ") || member.user?.name || baseEmail || "Pending member";

  return {
    id: member.id,
    userId: member.userId,
    email,
    invitedEmail: member.invitedEmail,
    role: member.role,
    status: member.status,
    invitedAt: member.invitedAt,
    acceptedAt: member.acceptedAt,
    displayName,
    avatarUrl: member.user?.pictureUrl || null,
    isSelf:
      (member.userId && member.userId === currentUserId) ||
      (email && currentEmail && email === currentEmail),
  };
}

async function ensureAnotherActiveOwner(tx, projectId, excludingMemberId) {
  const remainingOwners = await tx.projectContributor.count({
    where: {
      projectId,
      status: "active",
      role: "owner",
      id: { not: excludingMemberId },
    },
  });
  if (remainingOwners === 0) {
    throw new ProjectShareError(
      400,
      "At least one active owner is required for every project.",
    );
  }
}

function handleKnownError(res, err) {
  if (err instanceof ProjectAccessError || err instanceof ProjectShareError) {
    return res.status(err.status ?? 400).json({ error: err.message });
  }
  if (err?.code === "P2002") {
    return res.status(409).json({ error: "Member already exists" });
  }
  logger.error("Project share operation failed:", err);
  return res.status(500).json({ error: "Project share operation failed" });
}

export async function list(req, res) {
  try {
    const projectId = req.params?.id;
    if (!projectId) {
      return res.status(400).json({ error: "Missing project id" });
    }

    const access = await ensureProjectAccess({
      projectId,
      user: req.user,
      allowedRoles: ["owner", "editor"],
    });
    const membersRaw = await prisma.projectContributor.findMany({
      where: { projectId },
      orderBy: [{ invitedAt: "asc" }, { createdAt: "asc" }],
      select: MEMBER_SELECT,
    });
    const members = membersRaw.map((member) =>
      buildMemberPayload(member, req.user),
    );

    return res.json({
      members,
      role: access.role,
    });
  } catch (err) {
    return handleKnownError(res, err);
  }
}

export async function create(req, res) {
  try {
    const projectId = req.params?.id;
    if (!projectId) {
      return res.status(400).json({ error: "Missing project id" });
    }

    await ensureProjectAccess({
      projectId,
      user: req.user,
      allowedRoles: ["owner"],
    });

    const raw = req.body || {};
    const roleRaw = typeof raw.role === "string" ? raw.role.trim() : "";
    const role = roleRaw.toLowerCase();
    if (!VALID_ROLES.has(role)) {
      return res.status(400).json({ error: "Invalid role" });
    }

    const userId =
      typeof raw.userId === "string" && raw.userId.trim()
        ? raw.userId.trim()
        : null;
    const email = normalizeEmail(
      raw.email ||
        raw.userEmail ||
        raw.invitedEmail ||
        (typeof raw.identifier === "string" ? raw.identifier : null),
    );

    if (!userId && !email) {
      return res.status(400).json({
        error: "Provide an existing user id or an email address to invite.",
      });
    }

    const result = await prisma.$transaction(async (tx) => {
      let targetUser = null;
      let inviteEmail = email;

      if (userId) {
        targetUser = await tx.user.findUnique({
          where: { id: userId },
          select: {
            id: true,
            name: true,
            primaryEmail: { select: { email: true } },
          },
        });
        if (!targetUser) {
          throw new ProjectShareError(404, "User not found");
        }
        inviteEmail =
          inviteEmail || normalizeEmail(targetUser.primaryEmail?.email ?? null);
      } else if (inviteEmail) {
        const emailRecord = await tx.userEmail.findUnique({
          where: { email: inviteEmail },
          select: { userId: true },
        });
        if (emailRecord) {
          targetUser = await tx.user.findUnique({
            where: { id: emailRecord.userId },
            select: {
              id: true,
              name: true,
              primaryEmail: { select: { email: true } },
            },
          });
        }
      }

      const lookup = [];
      if (targetUser?.id) lookup.push({ userId: targetUser.id });
      if (inviteEmail) lookup.push({ invitedEmail: inviteEmail });

      let existing = null;
      if (lookup.length) {
        existing = await tx.projectContributor.findFirst({
          where: { projectId, OR: lookup },
          select: MEMBER_SELECT,
        });
      }

      const now = new Date();
      let memberRecord = null;

      if (existing) {
        memberRecord = await tx.projectContributor.update({
          where: { id: existing.id },
          data: {
            role,
            userId: targetUser?.id ?? existing.userId,
            invitedEmail: inviteEmail ?? existing.invitedEmail,
            status: targetUser ? "active" : existing.status,
            acceptedAt: targetUser
              ? existing.acceptedAt || now
              : existing.acceptedAt,
          },
          select: MEMBER_SELECT,
        });
      } else {
        memberRecord = await tx.projectContributor.create({
          data: {
            id: uuid("pm_"),
            projectId,
            userId: targetUser?.id ?? null,
            invitedEmail: inviteEmail,
            role,
            status: targetUser ? "active" : "pending",
            acceptedAt: targetUser ? now : null,
          },
          select: MEMBER_SELECT,
        });
      }

      if (role === "owner" || existing?.role === "owner") {
        await syncProjectPrimaryOwner(projectId, { tx });
      }

      return { member: memberRecord, created: !existing };
    });

    return res
      .status(result.created ? 201 : 200)
      .json({ member: buildMemberPayload(result.member, req.user) });
  } catch (err) {
    return handleKnownError(res, err);
  }
}

export async function update(req, res) {
  try {
    const projectId = req.params?.id;
    const memberId = req.params?.memberId;
    if (!projectId || !memberId) {
      return res.status(400).json({ error: "Missing identifiers" });
    }

    await ensureProjectAccess({
      projectId,
      user: req.user,
      allowedRoles: ["owner"],
    });

    const payload = req.body || {};
    const updates = {};

    if (typeof payload.role === "string") {
      const role = payload.role.trim().toLowerCase();
      if (!VALID_ROLES.has(role)) {
        return res.status(400).json({ error: "Invalid role" });
      }
      updates.role = role;
    }

    if (typeof payload.status === "string") {
      const status = payload.status.trim().toLowerCase();
      if (!MUTABLE_STATUSES.has(status)) {
        return res.status(400).json({ error: "Invalid status" });
      }
      updates.status = status;
    }

    if (!Object.keys(updates).length) {
      return res.status(400).json({ error: "No updates supplied" });
    }

    const result = await prisma.$transaction(async (tx) => {
      const member = await tx.projectContributor.findUnique({
        where: { id: memberId },
        select: {
          id: true,
          projectId: true,
          role: true,
          status: true,
          acceptedAt: true,
          userId: true,
        },
      });
      if (!member || member.projectId !== projectId) {
        throw new ProjectShareError(404, "Member not found");
      }

      const isOwnerDowngrade =
        member.role === "owner" &&
        (updates.role === "editor" ||
          updates.role === "viewer" ||
          updates.status === "revoked" ||
          updates.status === "pending");

      if (isOwnerDowngrade && member.status === "active") {
        await ensureAnotherActiveOwner(tx, projectId, member.id);
      }

      if (updates.status === "active" && !member.userId) {
        throw new ProjectShareError(
          400,
          "Cannot activate a pending invite until the user joins.",
        );
      }

      const data = {};
      if (updates.role) data.role = updates.role;
      if (updates.status) {
        data.status = updates.status;
        data.acceptedAt =
          updates.status === "active" ? new Date() : member.acceptedAt;
        if (updates.status !== "active") {
          data.acceptedAt = null;
        }
      }

      const updated = await tx.projectContributor.update({
        where: { id: member.id },
        data,
        select: MEMBER_SELECT,
      });

      if (
        member.role === "owner" ||
        updates.role === "owner" ||
        updates.status
      ) {
        await syncProjectPrimaryOwner(projectId, { tx });
      }

      return updated;
    });

    const memberPayload = buildMemberPayload(result, req.user);
    return res.json({ member: memberPayload });
  } catch (err) {
    return handleKnownError(res, err);
  }
}

export async function remove(req, res) {
  try {
    const projectId = req.params?.id;
    const memberId = req.params?.memberId;
    if (!projectId || !memberId) {
      return res.status(400).json({ error: "Missing identifiers" });
    }

    await ensureProjectAccess({
      projectId,
      user: req.user,
      allowedRoles: ["owner"],
    });

    await prisma.$transaction(async (tx) => {
      const member = await tx.projectContributor.findUnique({
        where: { id: memberId },
        select: {
          projectId: true,
          role: true,
          status: true,
        },
      });
      if (!member || member.projectId !== projectId) {
        throw new ProjectShareError(404, "Member not found");
      }

      if (member.role === "owner" && member.status === "active") {
        await ensureAnotherActiveOwner(tx, projectId, memberId);
      }

      await tx.projectContributor.delete({ where: { id: memberId } });
      await syncProjectPrimaryOwner(projectId, { tx });
    });

    return res.status(204).end();
  } catch (err) {
    return handleKnownError(res, err);
  }
}
