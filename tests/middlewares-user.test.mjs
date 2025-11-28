import test from "node:test";
import assert from "node:assert/strict";

import requireRole from "$/middlewares/requireRole.js";

function buildReq(user) {
  return {
    path: "/api/example",
    user,
  };
}

function buildRes() {
  return {
    statusCode: null,
    payload: null,
    status(code) {
      this.statusCode = code;
      return this;
    },
    json(payload) {
      this.payload = payload;
      return this;
    },
    render(view, payload) {
      this.payload = { view, payload };
      return this;
    },
  };
}

test("requireRole allows any authenticated user when no constraints", async () => {
  const guard = requireRole();
  let called = false;
  const next = () => {
    called = true;
  };

  await guard(buildReq({ id: "u_1" }), buildRes(), next);
  assert.equal(called, true);
});

test("requireRole denies unauthenticated users", async () => {
  const guard = requireRole(["admin"]);
  const res = buildRes();

  await guard({ path: "/api/foo" }, res, () => {});

  assert.equal(res.statusCode, 401);
  assert.deepEqual(res.payload, { error: "Unauthorized" });
});

test("requireRole allows by role key", async () => {
  const guard = requireRole(["admin"]);
  let called = false;
  const req = buildReq({
    id: "u",
    roles: [{ id: 1, key: "admin" }],
  });

  await guard(req, buildRes(), () => {
    called = true;
  });

  assert.equal(called, true);
});

test("requireRole allows wildcard", async () => {
  const guard = requireRole("any");
  let called = false;
  const req = buildReq({ id: "u" });

  await guard(req, buildRes(), () => {
    called = true;
  });
  assert.equal(called, true);
});

test("requireRole allows by capability", async () => {
  const guard = requireRole(["cap:projects.manage"]);
  let called = false;

  const req = buildReq({
    id: "u",
    capabilities: { "projects.manage": "allow" },
  });

  await guard(req, buildRes(), () => {
    called = true;
  });

  assert.equal(called, true);
});

test("requireRole denies when capability is deny", async () => {
  const guard = requireRole(["cap:projects.manage"]);
  const res = buildRes();

  const req = buildReq({
    id: "u",
    capabilities: { "projects.manage": "deny" },
  });

  await guard(req, res, () => {});

  assert.equal(res.statusCode, 403);
  assert.deepEqual(res.payload, { error: "Forbidden" });
});
