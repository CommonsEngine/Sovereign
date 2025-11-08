import test from "node:test";
import assert from "node:assert/strict";

import {
  createPluginAuthHelpers,
  PluginCapabilityError,
  createPlatformCapabilityAsserter,
} from "$/ext-host/plugin-auth.js";

function buildReq(user) {
  return { path: "/api/plugins/blog", user };
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
  };
}

test("assertUserCapability allows when threshold met", () => {
  const { assertUserCapability } = createPluginAuthHelpers();
  const req = buildReq({ id: "u", capabilities: { "test.cap": "allow" } });
  assert.equal(assertUserCapability(req, "test.cap"), true);
});

test("assertUserCapability throws when capability missing", () => {
  const { assertUserCapability } = createPluginAuthHelpers();
  const req = buildReq({ id: "u", capabilities: {} });
  assert.throws(() => assertUserCapability(req, "test.cap"), PluginCapabilityError);
});

test("requireAuthz middleware enforces capabilities", async () => {
  const { requireAuthz } = createPluginAuthHelpers();
  const guard = requireAuthz({ capabilities: ["test.cap"] });
  const req = buildReq({ id: "u", capabilities: { "test.cap": "allow" } });
  const res = buildRes();
  let called = false;
  await guard(req, res, () => {
    called = true;
  });
  assert.equal(called, true);

  const badReq = buildReq({ id: "u", capabilities: {} });
  const badRes = buildRes();
  await guard(badReq, badRes, () => {});
  assert.equal(badRes.statusCode, 403);
});

test("assertPlatformCapability checks declared set", () => {
  const assertPlatformCapability = createPlatformCapabilityAsserter("blog", ["database"]);
  assert.equal(assertPlatformCapability("database"), true);
  assert.throws(() => assertPlatformCapability("fs"), PluginCapabilityError);
});
