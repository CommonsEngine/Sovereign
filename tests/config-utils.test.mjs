import test from "node:test";
import assert from "node:assert/strict";

import { toBool } from "../src/config/utils.mjs";

test("toBool returns default for empty input", () => {
  assert.equal(toBool(undefined, true), true);
  assert.equal(toBool("", false), false);
});

test("toBool identifies truthy strings", () => {
  ["1", "true", "TRUE", "Yes", " on "].forEach((val) => {
    assert.equal(toBool(val, false), true, `expected ${val} to be truthy`);
  });
});

test("toBool handles falsy strings", () => {
  ["0", "false", "no", "off"].forEach((val) => {
    assert.equal(toBool(val, true), false, `expected ${val} to be falsy`);
  });
});
