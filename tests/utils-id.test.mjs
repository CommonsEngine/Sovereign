import test from "node:test";
import assert from "node:assert/strict";

import { uuid } from "$/utils/id.js";

const allowed = /^[A-Za-z0-9_-]+$/;

test("uuid respects length budget and allowed charset", () => {
  const id = uuid("pre_", "salt");

  assert.equal(id.startsWith("pre_"), true);
  assert.equal(id.length <= 32, true);
  assert.equal(allowed.test(id), true);
});

test("uuid core length stays within remaining budget for long prefixes", () => {
  const prefix = "averylongprefix_";
  const id = uuid(prefix);
  const core = id.slice(prefix.length);

  assert.equal(core.length <= Math.max(3, 32 - prefix.length), true);
  assert.equal(allowed.test(id), true);
});

test("uuid produces varied values when called repeatedly", () => {
  const ids = new Set();
  for (let i = 0; i < 5; i++) {
    ids.add(uuid("seq_"));
  }
  assert.equal(ids.size > 1, true);
});
