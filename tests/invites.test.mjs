import path from "node:path";
import "../platform/scripts/register-alias.mjs";
import test from "node:test";
import assert from "node:assert/strict";

process.env.ROOT_DIR =
  process.env.ROOT_DIR || path.resolve(new URL("..", import.meta.url).pathname);
process.env.SV_SKIP_ENV_REFRESH = "1";
process.env.APP_SECRET = process.env.APP_SECRET || "test-secret";

const {
  computeInviteHmac,
  generateInviteCode,
  deriveInviteStatus,
  validateInviteForEmail,
  redeemInviteForUser,
  serializeInvite,
} = await import("$/services/invites.js");

function future(hours = 1) {
  return new Date(Date.now() + hours * 60 * 60 * 1000);
}

test("computeInviteHmac is deterministic and matches generateInviteCode", () => {
  const h1 = computeInviteHmac("INV-AAAA-BBBB");
  const h2 = computeInviteHmac("inv-aaaa-bbbb");
  assert.equal(h1, h2);
  assert.ok(/^[a-f0-9]{64}$/i.test(h1));

  const { code, codeHmac } = generateInviteCode();
  assert.equal(codeHmac, computeInviteHmac(code));
});

test("deriveInviteStatus covers active/expired/exhausted/revoked", () => {
  const base = {
    maxUses: 3,
    usedCount: 0,
    expiresAt: future(1),
    revokedAt: null,
  };
  assert.equal(deriveInviteStatus(base).status, "active");
  assert.equal(deriveInviteStatus({ ...base, revokedAt: new Date() }).status, "revoked");
  assert.equal(
    deriveInviteStatus({ ...base, expiresAt: new Date(Date.now() - 1000) }).status,
    "expired"
  );
  assert.equal(
    deriveInviteStatus({ ...base, usedCount: 3, expiresAt: future(1) }).status,
    "exhausted"
  );
});

test("validateInviteForEmail enforces allowlists and domains", () => {
  const invite = {
    maxUses: null,
    usedCount: 0,
    expiresAt: future(1),
    revokedAt: null,
    allowedEmail: "user@example.com",
    allowedDomain: null,
  };
  assert.equal(validateInviteForEmail(invite, "user@example.com").ok, true);
  assert.equal(validateInviteForEmail(invite, "other@example.com").ok, false);

  const inviteDomain = { ...invite, allowedEmail: null, allowedDomain: "example.org" };
  assert.equal(validateInviteForEmail(inviteDomain, "a@example.org").ok, true);
  assert.equal(validateInviteForEmail(inviteDomain, "a@else.com").ok, false);
});

function createTxHarness(invite) {
  const state = {
    invite: { ...invite },
    uses: new Map(),
    roleAssignments: [],
  };

  const tx = {
    invite: {
      async findUnique({ where }) {
        if (where?.id !== state.invite.id) return null;
        return { ...state.invite };
      },
      async update({ where, data }) {
        if (where?.id === state.invite.id && data?.usedCount?.increment) {
          state.invite.usedCount += data.usedCount.increment;
        }
        return { ...state.invite };
      },
    },
    inviteUse: {
      async findUnique({ where }) {
        return state.uses.get(`${where.inviteId}:${where.userId}`) || null;
      },
      async create({ data }) {
        const rec = { ...data, id: `use_${state.uses.size + 1}`, createdAt: new Date() };
        state.uses.set(`${data.inviteId}:${data.userId}`, rec);
        return rec;
      },
    },
    userRole: {
      async findUnique() {
        return { id: 1, key: state.invite.roleKey };
      },
      async findFirst() {
        return { id: 1, key: state.invite.roleKey };
      },
    },
    userRoleAssignment: {
      async upsert({ create }) {
        state.roleAssignments.push(create);
        return create;
      },
    },
    projectContributor: {
      async findFirst() {
        return null;
      },
      async create() {
        return null;
      },
      async update() {
        return null;
      },
    },
  };

  return { state, tx };
}

test("redeemInviteForUser increments usage, records use, assigns role", async () => {
  const invite = {
    id: "inv_1",
    roleKey: "platform:user",
    maxUses: 2,
    usedCount: 0,
    expiresAt: future(1),
    revokedAt: null,
    allowedEmail: null,
    allowedDomain: null,
    projectId: null,
  };
  const { state, tx } = createTxHarness(invite);

  const res = await redeemInviteForUser({
    invite,
    userId: "user_1",
    email: "test@example.com",
    ip: "127.0.0.1",
    userAgent: "jest",
    tx,
  });

  assert.equal(res.ok, true);
  assert.equal(state.invite.usedCount, 1);
  assert.equal(state.uses.size, 1);
  assert.equal(state.roleAssignments.length >= 1, true);
});

test("redeemInviteForUser is idempotent per userId and blocks exhausted invites", async () => {
  const invite = {
    id: "inv_2",
    roleKey: "platform:user",
    maxUses: 1,
    usedCount: 0,
    expiresAt: future(1),
    revokedAt: null,
    allowedEmail: null,
    allowedDomain: null,
    projectId: null,
  };
  const { state, tx } = createTxHarness(invite);

  const first = await redeemInviteForUser({
    invite,
    userId: "user_1",
    email: "first@example.com",
    tx,
  });
  assert.equal(first.ok, true);
  assert.equal(state.invite.usedCount, 1);

  const second = await redeemInviteForUser({
    invite,
    userId: "user_1",
    email: "first@example.com",
    tx,
  }).catch((err) => ({ ok: false, error: err?.message }));
  assert.equal(second.ok, false);
  assert.equal(state.invite.usedCount, 1, "should not increment after exhaustion");

  const third = await redeemInviteForUser({
    invite,
    userId: "user_2",
    email: "second@example.com",
    tx,
  }).catch((err) => ({ ok: false, error: err?.message }));
  assert.equal(third.ok, false, "max uses exhausted should fail for new user");
});

test("serializeInvite reports remaining uses/null correctly", () => {
  const invite = {
    id: "inv",
    codePreview: "INV-ABCD",
    tenantId: null,
    projectId: null,
    roleKey: "platform:user",
    maxUses: null,
    usedCount: 0,
    expiresAt: future(1),
    revokedAt: null,
    allowedEmail: null,
    allowedDomain: null,
    createdByUserId: "u",
    createdAt: new Date(),
    updatedAt: new Date(),
  };
  const ser = serializeInvite(invite);
  assert.equal(ser.maxUses, null);
  assert.equal(ser.remainingUses, null);
  assert.equal(ser.status, "active");
});
