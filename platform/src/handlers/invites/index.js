import { prisma } from "$/services/database.js";
import env from "$/config/env.js";
import {
  createInvite as createInviteRecord,
  deriveInviteStatus,
  findInvite,
  serializeInvite,
} from "$/services/invites.js";

const { DEFAULT_TENANT_ID } = env();

function parseMaxUses(value, mode) {
  if (mode === "single") return 1;
  if (mode === "unlimited") return null;
  const num = Number(value);
  if (!Number.isFinite(num)) return null;
  if (num <= 0) return null;
  return Math.floor(num);
}

function parseDate(value) {
  if (!value) return null;
  const dt = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(dt.getTime())) return null;
  return dt;
}

function hasCapability(user, key) {
  if (!user || !key) return false;
  const caps = user.capabilities || {};
  const value = caps[key];
  if (!value) return false;
  const precedence = {
    allow: 5,
    consent: 4,
    compliance: 3,
    scoped: 2,
    anonymized: 2,
    deny: 1,
  };
  return (precedence[value] || 0) > precedence.deny;
}

export async function exchange(req, res) {
  try {
    const inviteCode =
      typeof req.body?.inviteCode === "string"
        ? req.body.inviteCode.trim()
        : typeof req.query?.inviteCode === "string"
          ? req.query.inviteCode.trim()
          : "";
    if (!inviteCode) {
      return res.status(400).json({ error: "Missing invite code" });
    }

    const invite = await findInvite(inviteCode);
    const status = deriveInviteStatus(invite);
    if (!invite || status.status !== "active") {
      return res.status(400).json({ error: "Invalid invite", status: status.status });
    }

    const remainingUses =
      invite.maxUses === null || invite.maxUses === undefined
        ? null
        : Math.max((invite.maxUses || 0) - (invite.usedCount || 0), 0);

    return res.json({
      inviteToken: invite.codeHmac,
      inviteId: invite.id,
      preview: invite.codePreview,
      status: status.status,
      expiresAt: invite.expiresAt,
      remainingUses,
    });
  } catch (err) {
    return res.status(500).json({ error: "Failed to exchange invite", detail: err?.message });
  }
}

export async function create(req, res) {
  try {
    const payload = req.body || {};
    const roleKey = typeof payload.roleKey === "string" ? payload.roleKey.trim() : "";
    if (!roleKey) {
      return res.status(400).json({ error: "roleKey is required" });
    }

    if (!hasCapability(req.user, "user:invite.admin.feature")) {
      return res.status(403).json({ error: "Invite administration is disabled." });
    }

    const mode = typeof payload.mode === "string" ? payload.mode.toLowerCase() : "";
    const maxUses = parseMaxUses(payload.maxUses, mode);
    const expiresAt =
      parseDate(payload.expiresAt || payload.expires) ||
      (typeof payload.expiresInHours === "number" && payload.expiresInHours > 0
        ? new Date(Date.now() + payload.expiresInHours * 60 * 60 * 1000)
        : null);

    const tenantIdRaw = typeof payload.tenantId === "string" ? payload.tenantId.trim() : "";
    const projectId = typeof payload.projectId === "string" ? payload.projectId.trim() : null;
    const tenantId = tenantIdRaw || DEFAULT_TENANT_ID || null;
    const wantsMultiUse = maxUses === null || maxUses > 1;

    if (wantsMultiUse && !hasCapability(req.user, "user:invite.code.multi_use")) {
      return res.status(403).json({ error: "Multi-use invites are not enabled for this user." });
    }

    const { invite, code } = await createInviteRecord({
      createdByUserId: req.user?.id,
      roleKey,
      tenantId,
      projectId,
      maxUses,
      expiresAt,
      allowedEmail: payload.allowedEmail,
      allowedDomain: payload.allowedDomain,
    });

    return res.status(201).json({
      code,
      invite: serializeInvite(invite),
    });
  } catch (err) {
    return res.status(500).json({ error: "Failed to create invite", detail: err?.message });
  }
}

export async function list(req, res) {
  try {
    const { tenant, project, status } = req.query || {};
    const filters = {};
    if (tenant) filters.tenantId = String(tenant);
    if (project) filters.projectId = String(project);

    if (!hasCapability(req.user, "user:invite.admin.feature")) {
      return res.status(403).json({ error: "Invite administration is disabled." });
    }

    const invites = await prisma.invite.findMany({
      where: filters,
      orderBy: { createdAt: "desc" },
    });

    const normalizedStatus = typeof status === "string" ? status.toLowerCase() : "";
    const items = invites
      .map((invite) => ({
        raw: invite,
        view: serializeInvite(invite),
      }))
      .filter(({ view }) => {
        if (!normalizedStatus) return true;
        return view.status === normalizedStatus;
      })
      .map(({ view }) => view);

    return res.json({ invites: items });
  } catch (err) {
    return res.status(500).json({ error: "Failed to list invites", detail: err?.message });
  }
}

export async function get(req, res) {
  try {
    const id = req.params?.id;
    if (!id) {
      return res.status(400).json({ error: "Missing invite id" });
    }

    if (!hasCapability(req.user, "user:invite.admin.feature")) {
      return res.status(403).json({ error: "Invite administration is disabled." });
    }

    const invite = await prisma.invite.findUnique({
      where: { id },
      include: { uses: { orderBy: { createdAt: "desc" } } },
    });
    if (!invite) {
      return res.status(404).json({ error: "Invite not found" });
    }

    const view = serializeInvite(invite);
    view.uses = (invite.uses || []).map((use) => ({
      id: use.id,
      userId: use.userId,
      email: use.email,
      ip: use.ip,
      userAgent: use.userAgent,
      createdAt: use.createdAt,
    }));

    return res.json({ invite: view });
  } catch (err) {
    return res.status(500).json({ error: "Failed to load invite", detail: err?.message });
  }
}

export async function revoke(req, res) {
  try {
    const id = req.params?.id;
    if (!id) {
      return res.status(400).json({ error: "Missing invite id" });
    }

    if (!hasCapability(req.user, "user:invite.admin.feature")) {
      return res.status(403).json({ error: "Invite administration is disabled." });
    }

    await prisma.invite.update({
      where: { id },
      data: { revokedAt: new Date() },
    });

    return res.json({ ok: true });
  } catch (err) {
    if (err?.code === "P2025") {
      return res.status(404).json({ error: "Invite not found" });
    }
    return res.status(500).json({ error: "Failed to revoke invite", detail: err?.message });
  }
}
