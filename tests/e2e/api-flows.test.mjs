import path from "node:path";
import test from "node:test";
import assert from "node:assert/strict";
import express from "express";
import request from "supertest";

import { authenticator } from "otplib";
import QRCode from "qrcode";
import { prisma } from "$/services/database.js";
import * as inviteHandlers from "$/handlers/invites/index.js";
import projectsHandlers from "$/handlers/projects/index.js";
import * as shareHandlers from "$/handlers/projects/shares.js";
import { createSetup, verifySetup, regenerateRecoveryCodes, disableTotp } from "$/services/totp.js";
import { redeemInviteForUser } from "$/services/invites.js";

process.env.ROOT_DIR ||= path.resolve(new URL("../..", import.meta.url).pathname);
process.env.SV_SKIP_ENV_REFRESH = "1";
process.env.APP_SECRET = "test-secret";
process.env.FEATURE_TOTP_ENABLED = "true";

function buildPrismaStub() {
  const state = {
    invites: new Map(),
    inviteUses: [],
    projects: new Map(),
    contributors: new Map(),
    users: new Map([
      [
        "u_member",
        { id: "u_member", name: "Member", primaryEmail: { email: "member@example.com" } },
      ],
    ]),
    userEmails: new Map([["member@example.com", { userId: "u_member" }]]),
    userTotp: new Map(),
    pending: new Map(),
    userRoles: new Map([
      ["platform:user", { id: 1, key: "platform:user" }],
      ["platform:owner", { id: 2, key: "platform:owner" }],
    ]),
    roleAssignments: [],
  };

  let inviteSeq = 1;
  let projectSeq = 1;
  let memberSeq = 1;

  const stub = {
    invite: {
      async create({ data }) {
        const record = {
          id: `inv_${inviteSeq++}`,
          createdAt: new Date(),
          updatedAt: new Date(),
          usedCount: 0,
          revokedAt: null,
          ...data,
          uses: [],
        };
        state.invites.set(record.id, record);
        return { ...record };
      },
      async findUnique({ where }) {
        if (where?.id) {
          return state.invites.get(where.id) || null;
        }
        if (where?.codeHmac) {
          return [...state.invites.values()].find((i) => i.codeHmac === where.codeHmac) || null;
        }
        return null;
      },
      async findMany({ where } = {}) {
        let list = [...state.invites.values()];
        if (where?.tenantId) list = list.filter((i) => i.tenantId === where.tenantId);
        if (where?.projectId) list = list.filter((i) => i.projectId === where.projectId);
        return list.map((i) => ({ ...i }));
      },
      async update({ where, data }) {
        const rec = state.invites.get(where.id);
        if (!rec) throw Object.assign(new Error("Invite not found"), { code: "P2025" });
        Object.assign(rec, typeof data === "function" ? data(rec) : data);
        rec.updatedAt = new Date();
        return { ...rec };
      },
    },
    inviteUse: {
      async create({ data }) {
        const use = { id: `use_${state.inviteUses.length + 1}`, createdAt: new Date(), ...data };
        state.inviteUses.push(use);
        const inv = state.invites.get(data.inviteId);
        if (inv) inv.uses = inv.uses ? [...inv.uses, use] : [use];
        return use;
      },
      async findUnique({ where }) {
        return (
          state.inviteUses.find(
            (u) =>
              u.inviteId === where.inviteId_userId.inviteId &&
              u.userId === where.inviteId_userId.userId
          ) || null
        );
      },
    },
    project: {
      async create({ data, select }) {
        const rec = {
          id: data.id || `p_${projectSeq++}`,
          createdAt: new Date(),
          updatedAt: new Date(),
          ...data,
        };
        state.projects.set(rec.id, rec);
        return select
          ? Object.fromEntries(Object.entries(select).map(([k]) => [k, rec[k]]))
          : { ...rec };
      },
      async findMany({ where, select }) {
        let list = [...state.projects.values()];
        if (where?.contributors?.some?.OR?.length) {
          const allowed = new Set();
          for (const c of state.contributors.values()) {
            const matchesProject = where.contributors.some.OR.some(
              (cond) =>
                cond.status === c.status &&
                cond.OR.some(
                  (inner) =>
                    (inner.userId && inner.userId === c.userId) ||
                    (inner.invitedEmail && inner.invitedEmail === c.invitedEmail)
                )
            );
            if (matchesProject) allowed.add(c.projectId);
          }
          list = list.filter((p) => allowed.has(p.id));
        }
        return list.map((p) => {
          if (!select) return { ...p };
          const row = {};
          for (const key of Object.keys(select)) {
            if (key === "contributors") {
              row.contributors = [...state.contributors.values()].filter(
                (c) =>
                  c.projectId === p.id &&
                  (!select.contributors.where || c.status === select.contributors.where.status)
              );
            } else {
              row[key] = p[key];
            }
          }
          return row;
        });
      },
      async findUnique({ where, select }) {
        const rec = state.projects.get(where.id);
        if (!rec) return null;
        if (!select) return { ...rec };
        const row = {};
        for (const key of Object.keys(select)) {
          row[key] = rec[key];
        }
        return row;
      },
      async update({ where, data, select }) {
        const rec = state.projects.get(where.id);
        if (!rec) throw new Error("Project not found");
        Object.assign(rec, data, { updatedAt: new Date() });
        return select
          ? Object.fromEntries(Object.entries(select).map(([k]) => [k, rec[k]]))
          : { ...rec };
      },
      async delete({ where }) {
        state.projects.delete(where.id);
      },
    },
    projectContributor: {
      async create({ data, select }) {
        const rec = {
          id: data.id || `pc_${memberSeq++}`,
          invitedAt: data.invitedAt || new Date(),
          createdAt: new Date(),
          status: "active",
          ...data,
        };
        state.contributors.set(rec.id, rec);
        return select
          ? Object.fromEntries(Object.entries(select).map(([k]) => [k, rec[k]]))
          : { ...rec };
      },
      async findFirst({ where, select }) {
        const list = [...state.contributors.values()].filter((c) => {
          if (where.projectId && c.projectId !== where.projectId) return false;
          if (where.status && c.status !== where.status) return false;
          if (where.role && c.role !== where.role) return false;
          if (Array.isArray(where.OR)) {
            return where.OR.some((cond) => {
              if (cond.userId && cond.userId === c.userId) return true;
              if (cond.invitedEmail && cond.invitedEmail === c.invitedEmail) return true;
              return false;
            });
          }
          if (where.userId && where.userId === c.userId) return true;
          return true;
        });
        const found = list[0];
        if (!found) return null;
        if (!select) return { ...found };
        return Object.fromEntries(Object.entries(select).map(([k]) => [k, found[k]]));
      },
      async findMany({ where, orderBy, select }) {
        let list = [...state.contributors.values()].filter(
          (c) => !where || c.projectId === where.projectId
        );
        if (where?.role) list = list.filter((c) => c.role === where.role);
        if (where?.status) list = list.filter((c) => c.status === where.status);
        if (orderBy?.length) {
          list.sort((a, b) => a.invitedAt - b.invitedAt || a.createdAt - b.createdAt);
        }
        return list.map((c) => {
          if (!select) return { ...c };
          const row = {};
          for (const key of Object.keys(select)) {
            if (key === "user") {
              row.user = select.user ? state.users.get(c.userId) || null : null;
            } else {
              row[key] = c[key];
            }
          }
          return row;
        });
      },
      async update({ where, data, select }) {
        const rec = state.contributors.get(where.id);
        if (!rec) throw new Error("Contributor not found");
        Object.assign(rec, typeof data === "function" ? data(rec) : data);
        return select
          ? Object.fromEntries(Object.entries(select).map(([k]) => [k, rec[k]]))
          : { ...rec };
      },
      async delete({ where }) {
        state.contributors.delete(where.id);
      },
      async count({ where }) {
        return [...state.contributors.values()].filter((c) => c.projectId === where.projectId)
          .length;
      },
    },
    user: {
      async findUnique({ where, select }) {
        const user = state.users.get(where.id);
        if (!user) return null;
        if (!select) return { ...user };
        const row = {};
        for (const key of Object.keys(select)) {
          row[key] = user[key];
        }
        return row;
      },
    },
    userEmail: {
      async findUnique({ where }) {
        return state.userEmails.get(where.email) || null;
      },
    },
    userRole: {
      async findUnique({ where }) {
        if (!where?.key) return null;
        return state.userRoles.get(where.key) || null;
      },
      async findFirst({ where }) {
        if (where?.key?.equals) {
          return state.userRoles.get(where.key.equals) || null;
        }
        return null;
      },
    },
    userRoleAssignment: {
      async upsert({ where, create }) {
        const existing = state.roleAssignments.find(
          (ra) =>
            ra.userId === where.userId_roleId.userId && ra.roleId === where.userId_roleId.roleId
        );
        if (!existing) {
          state.roleAssignments.push({
            userId: where.userId_roleId.userId,
            roleId: where.userId_roleId.roleId,
          });
        }
        return existing || create;
      },
    },
    userTotp: {
      async upsert({ where, create, update }) {
        const existing = state.userTotp.get(where.userId);
        const merged = existing
          ? { ...existing, ...update, userId: where.userId }
          : { ...create, userId: where.userId };
        state.userTotp.set(where.userId, merged);
        return merged;
      },
      async findUnique({ where }) {
        return state.userTotp.get(where.userId) || null;
      },
      async update({ where, data }) {
        const existing = state.userTotp.get(where.userId) || { userId: where.userId };
        const merged = { ...existing };
        for (const [key, value] of Object.entries(data || {})) {
          if (value && typeof value === "object" && "increment" in value) {
            merged[key] = (merged[key] || 0) + Number(value.increment);
          } else {
            merged[key] = value;
          }
        }
        state.userTotp.set(where.userId, merged);
        return merged;
      },
      async delete({ where }) {
        state.userTotp.delete(where.userId);
      },
      async count() {
        return state.userTotp.size;
      },
    },
    totpPending: {
      async create({ data }) {
        state.pending.set(data.token, { ...data });
        return { ...data };
      },
      async findUnique({ where }) {
        return state.pending.get(where.token) || null;
      },
      async delete({ where }) {
        state.pending.delete(where.token);
      },
    },
    $transaction: async (fn) => fn(stub),
  };

  Object.assign(prisma, stub);
  return { state };
}

function buildApp() {
  const app = express();
  app.use(express.json());
  app.use((req, _res, next) => {
    req.user = {
      id: "u_owner",
      email: "owner@example.com",
    };
    next();
  });

  app.post("/api/invites", inviteHandlers.create);
  app.get("/api/invites", inviteHandlers.list);
  app.get("/api/invites/:id", inviteHandlers.get);
  app.post("/api/invites/:id/revoke", inviteHandlers.revoke);
  app.post("/api/invites/exchange", inviteHandlers.exchange);

  app.post("/api/projects", projectsHandlers.create);
  app.get("/api/projects", projectsHandlers.getAll);
  app.patch("/api/projects/:id", projectsHandlers.update);
  app.delete("/api/projects/:id", projectsHandlers.remove);

  app.post("/api/projects/:id/shares", shareHandlers.create);
  app.patch("/api/projects/:id/shares/:memberId", shareHandlers.update);
  app.delete("/api/projects/:id/shares/:memberId", shareHandlers.remove);

  app.post("/api/invites/redeem", async (req, res) => {
    const result = await redeemInviteForUser({
      inviteCode: req.body?.inviteCode,
      userId: req.body?.userId || req.user.id,
      email: req.body?.email || req.user.email,
      tx: prisma, // use stub directly to avoid nested tx
    });
    if (!result.ok) return res.status(400).json(result);
    res.json(result);
  });

  app.post("/api/totp/setup", async (req, res) => {
    try {
      const payload = await createSetup(req.user);
      res.json({ ok: true, ...payload });
    } catch (err) {
      res.status(400).json({ error: err.code || "totp_setup_failed", message: err.message });
    }
  });
  app.post("/api/totp/verify", async (req, res) => {
    try {
      const recoveryCodes = await verifySetup(req.user.id, req.body?.code);
      res.json({ ok: true, recoveryCodes });
    } catch (err) {
      res.status(400).json({ error: err.code || "totp_verify_failed", message: err.message });
    }
  });
  app.post("/api/totp/recovery/regenerate", async (req, res) => {
    try {
      const recoveryCodes = await regenerateRecoveryCodes(req.user.id);
      res.json({ ok: true, recoveryCodes });
    } catch (err) {
      res.status(400).json({ error: err.code || "totp_recovery_failed", message: err.message });
    }
  });
  app.post("/api/totp/disable", async (req, res) => {
    try {
      await disableTotp(req.user.id);
      res.json({ ok: true });
    } catch (err) {
      res.status(400).json({ error: err.code || "totp_disable_failed", message: err.message });
    }
  });

  return app;
}

test("E2E API flows: invites + projects + shares", async () => {
  const { state } = buildPrismaStub();
  const app = buildApp();

  // Create invite
  const inviteRes = await request(app)
    .post("/api/invites")
    .send({ roleKey: "platform:user", maxUses: 2 });
  assert.equal(inviteRes.status, 201);
  const invite = inviteRes.body.invite;
  assert.ok(invite?.id);
  assert.equal(invite.maxUses, 2);

  // Exchange invite code
  const exchangeRes = await request(app)
    .post("/api/invites/exchange")
    .send({ inviteCode: inviteRes.body.code });
  assert.equal(exchangeRes.status, 200);
  assert.equal(exchangeRes.body.inviteId, invite.id);

  // List invites
  const listRes = await request(app).get("/api/invites");
  assert.equal(listRes.status, 200);
  assert.equal(listRes.body.invites.length, 1);

  // Get single invite
  const getRes = await request(app).get(`/api/invites/${invite.id}`);
  assert.equal(getRes.status, 200);
  assert.equal(getRes.body.invite.id, invite.id);
  assert.equal(getRes.body.invite.uses.length, 0);

  // Revoke
  const revokeRes = await request(app).post(`/api/invites/${invite.id}/revoke`);
  assert.equal(revokeRes.status, 200);
  assert.equal(revokeRes.body.ok, true);

  // Project create
  const projectRes = await request(app)
    .post("/api/projects")
    .send({ name: "Test Project", type: "blog", scope: "private" });
  assert.equal(projectRes.status, 201);
  const projectId = projectRes.body.id;
  assert.ok(projectId);
  const ownerMembership = [...state.contributors.values()].find((c) => c.projectId === projectId);
  assert.equal(ownerMembership.role, "owner");

  // Project list
  const listProjects = await request(app).get("/api/projects");
  assert.equal(listProjects.status, 200);
  assert.equal(listProjects.body.projects.length, 1);

  // Project update
  const updateRes = await request(app)
    .patch(`/api/projects/${projectId}`)
    .send({ name: "Renamed Project" });
  assert.equal(updateRes.status, 200);
  assert.equal(updateRes.body.name, "Renamed Project");

  // Shares: invite member by email
  const shareRes = await request(app)
    .post(`/api/projects/${projectId}/shares`)
    .send({ role: "viewer", email: "member@example.com" });
  assert.equal(shareRes.status, 201);
  const memberId = shareRes.body.member.id;
  assert.ok(memberId);

  // Promote member
  const promoteRes = await request(app)
    .patch(`/api/projects/${projectId}/shares/${memberId}`)
    .send({ role: "editor" });
  assert.equal(promoteRes.status, 200);
  assert.equal(promoteRes.body.member.role, "editor");

  // Remove member
  const removeRes = await request(app).delete(`/api/projects/${projectId}/shares/${memberId}`);
  assert.equal(removeRes.status, 204);

  // Delete project
  const deleteRes = await request(app).delete(`/api/projects/${projectId}`);
  assert.equal(deleteRes.status, 204);
});

test("E2E invite redemption applies roles and project membership", async () => {
  const { state } = buildPrismaStub();
  const app = buildApp();

  // create project and invite tied to project
  const projectRes = await request(app)
    .post("/api/projects")
    .send({ name: "Invite Project", type: "blog", scope: "private" });
  const projectId = projectRes.body.id;

  const inviteRes = await request(app)
    .post("/api/invites")
    .send({ roleKey: "platform:owner", maxUses: 1, projectId });
  const { code } = inviteRes.body;

  const redeemRes = await request(app)
    .post("/api/invites/redeem")
    .send({ inviteCode: code, userId: "u_member", email: "member@example.com" });
  assert.equal(redeemRes.status, 200);
  assert.equal(redeemRes.body.ok, true);

  const inviteRecord = state.invites.values().next().value;
  assert.equal(inviteRecord.usedCount, 1);
  const member = [...state.contributors.values()].find(
    (c) => c.projectId === projectId && c.userId === "u_member"
  );
  assert.ok(member);
  assert.equal(member.role, "owner");
  const assignment = state.roleAssignments.find((ra) => ra.userId === "u_member");
  assert.ok(assignment, "role assignment recorded");
});

test("E2E security flows: TOTP setup/verify/regenerate/disable", async () => {
  const { state } = buildPrismaStub();
  const app = buildApp();

  const originalAuth = {
    generateSecret: authenticator.generateSecret,
    keyuri: authenticator.keyuri,
    check: authenticator.check,
  };
  const originalQr = QRCode.toDataURL;
  authenticator.generateSecret = () => "SECRET123";
  authenticator.keyuri = () => "otpauth://example";
  authenticator.check = (code, secret) => code === "123456" && secret === "SECRET123";
  QRCode.toDataURL = async () => "data:image/png;base64,qr";

  try {
    const setupRes = await request(app).post("/api/totp/setup");
    assert.equal(setupRes.status, 200);
    assert.equal(setupRes.body.secret, "SECRET123");
    assert.ok(setupRes.body.qrDataUrl);

    const verifyRes = await request(app).post("/api/totp/verify").send({ code: "123456" });
    assert.equal(verifyRes.status, 200);
    assert.ok(Array.isArray(verifyRes.body.recoveryCodes));
    assert.equal(verifyRes.body.recoveryCodes.length > 0, true);
    assert.equal(state.userTotp.get("u_owner")?.verified, true);

    const regenRes = await request(app).post("/api/totp/recovery/regenerate");
    assert.equal(regenRes.status, 200);
    assert.equal(regenRes.body.recoveryCodes.length > 0, true);

    const disableRes = await request(app).post("/api/totp/disable");
    assert.equal(disableRes.status, 200);
    assert.equal(state.userTotp.has("u_owner"), false);
  } finally {
    authenticator.generateSecret = originalAuth.generateSecret;
    authenticator.keyuri = originalAuth.keyuri;
    authenticator.check = originalAuth.check;
    QRCode.toDataURL = originalQr;
  }
});
