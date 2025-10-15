import test from "node:test";
import assert from "node:assert/strict";

import {
  slugifyName,
  buildSlug,
  MAX_SLUG_ATTEMPTS,
} from "$/handlers/projects/core/create.mjs";

test("slugifyName trims, lowercases and strips invalid characters", () => {
  assert.equal(slugifyName("   Hello World!  "), "hello-world");
  assert.equal(slugifyName("My_Project@2024"), "my-project-2024");
});

test("slugifyName enforces max length", () => {
  const longName = "a".repeat(200);
  assert.equal(slugifyName(longName).length <= 64, true);
});

test("buildSlug returns base on first attempt", () => {
  const base = "project";
  assert.equal(buildSlug(base, 0), base);
});

test("buildSlug adds numeric suffix on subsequent attempts", () => {
  const base = "project";
  assert.equal(buildSlug(base, 2), "project-2");
});

test("buildSlug falls back to random slug when base empty", () => {
  const slug = buildSlug("", 0);
  assert.equal(typeof slug, "string");
  assert.equal(slug.length > 0, true);
});

test("MAX_SLUG_ATTEMPTS is sufficient for collision retries", () => {
  assert.equal(Number.isInteger(MAX_SLUG_ATTEMPTS), true);
  assert.equal(MAX_SLUG_ATTEMPTS > 0, true);
});
