import path from "node:path";
import test from "node:test";
import assert from "node:assert/strict";

import { authenticator } from "otplib";
import QRCode from "qrcode";
import { prisma } from "$/services/database.js";

process.env.ROOT_DIR ||= path.resolve(new URL("..", import.meta.url).pathname);
process.env.SV_SKIP_ENV_REFRESH = "1";
process.env.FEATURE_TOTP_ENABLED = "true";
process.env.APP_SECRET = "test-secret";
process.env.TOTP_RECOVERY_CODES = "4";
process.env.TOTP_RECOVERY_LENGTH = "6";

const originalAuth = {
  check: authenticator.check,
  generateSecret: authenticator.generateSecret,
  keyuri: authenticator.keyuri,
};
const originalQr = QRCode.toDataURL;

test.after(() => {
  authenticator.check = originalAuth.check;
  authenticator.generateSecret = originalAuth.generateSecret;
  authenticator.keyuri = originalAuth.keyuri;
  QRCode.toDataURL = originalQr;
});

function applyUpdate(target, data = {}) {
  const updated = { ...target };
  for (const [key, value] of Object.entries(data)) {
    if (value && typeof value === "object" && "increment" in value) {
      updated[key] = (updated[key] || 0) + Number(value.increment);
    } else {
      updated[key] = value;
    }
  }
  return updated;
}

function stubPrisma() {
  const state = {
    userTotp: new Map(),
    pending: new Map(),
  };

  prisma.userTotp = {
    async upsert({ where, create, update }) {
      const existing = state.userTotp.get(where.userId);
      const merged = existing ? applyUpdate(existing, update) : { ...create, userId: where.userId };
      state.userTotp.set(where.userId, merged);
      return merged;
    },
    async findUnique({ where }) {
      return state.userTotp.get(where.userId) || null;
    },
    async update({ where, data }) {
      const existing = state.userTotp.get(where.userId) || { userId: where.userId };
      const merged = applyUpdate(existing, data);
      state.userTotp.set(where.userId, merged);
      return merged;
    },
    async delete({ where }) {
      state.userTotp.delete(where.userId);
    },
  };

  prisma.totpPending = {
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
  };

  return state;
}

async function importTotp() {
  return import("$/services/totp.js");
}

test("createSetup persists secret and returns QR data URL", async () => {
  const state = stubPrisma();
  authenticator.generateSecret = () => "SECRET123";
  authenticator.keyuri = () => "otpauth://example";
  QRCode.toDataURL = async () => "data:image/png;base64,qr";

  const { createSetup } = await importTotp();
  const res = await createSetup({ id: "u_1", primaryEmail: { email: "user@example.com" } });

  assert.equal(res.secret, "SECRET123");
  assert.equal(res.otpauth, "otpauth://example");
  assert.equal(res.qrDataUrl, "data:image/png;base64,qr");
  const saved = state.userTotp.get("u_1");
  assert.ok(saved, "setup should store a record");
  assert.equal(saved.secret, "SECRET123");
  assert.equal(saved.verified, false);
});

test("verifySetup accepts valid code and writes recovery hashes", async () => {
  const state = stubPrisma();
  authenticator.check = () => true;
  authenticator.generateSecret = () => "SECRET123";
  authenticator.keyuri = () => "otpauth://example";
  QRCode.toDataURL = async () => null;

  const { createSetup, verifySetup } = await importTotp();

  await createSetup({ id: "u_2", primaryEmail: { email: "user2@example.com" } });
  const codes = await verifySetup("u_2", "123456");

  const saved = state.userTotp.get("u_2");
  assert.equal(saved.verified, true);
  assert.equal(Array.isArray(saved.recoveryCodes), true);
  assert.equal(saved.recoveryCodes.length, 4);
  assert.equal(Array.isArray(codes) && codes.length, 4);
  assert.equal(
    saved.recoveryCodes.some((c) => codes.includes(c)),
    false,
    "codes should be hashed"
  );
});

test("verifyLoginTotp tracks failures then resets on success", async () => {
  const state = stubPrisma();
  state.userTotp.set("u_3", {
    userId: "u_3",
    secret: "SECRET",
    verified: true,
    failedAttempts: 0,
  });
  authenticator.check = (code) => code === "999111";

  const { verifyLoginTotp } = await importTotp();

  await assert.rejects(
    () => verifyLoginTotp("u_3", "000000"),
    (err) => err.code === "totp_invalid"
  );
  assert.equal(state.userTotp.get("u_3").failedAttempts, 1);

  await verifyLoginTotp("u_3", "999111");
  const saved = state.userTotp.get("u_3");
  assert.equal(saved.failedAttempts, 0);
  assert.ok(saved.lastUsedAt instanceof Date);
});

test("pending tokens expire and are cleared", async () => {
  const state = stubPrisma();
  const { createPending, getPending, clearPending } = await importTotp();

  const { token } = await createPending("u_4");
  const rec = await getPending(token);
  assert.ok(rec, "pending token should be retrievable");

  state.pending.set("expired", { token: "expired", expiresAt: new Date(Date.now() - 1000) });
  const expired = await getPending("expired");
  assert.equal(expired, null);
  assert.equal(state.pending.has("expired"), false, "expired token should be deleted");

  await clearPending(token);
  assert.equal(state.pending.has(token), false);
});
