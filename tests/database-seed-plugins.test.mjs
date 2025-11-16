import test from "node:test";
import assert from "node:assert/strict";
import os from "node:os";
import path from "node:path";
import fs from "node:fs/promises";

const rbacPath = new URL("../platform/scripts/data/rbac.json", import.meta.url);
const rbac = JSON.parse(await fs.readFile(rbacPath, "utf8"));
import { seedPlugins } from "../tools/database-seed-plugins.mjs";

class MockPrisma {
  constructor(roleCatalog) {
    this.roles = roleCatalog.map((role, idx) => ({ id: idx + 1, key: role.key }));
    this.userCapability = {
      upsert: async (payload) => {
        this.capabilities.push(payload);
        return payload;
      },
    };
    this.userRoleCapability = {
      upsert: async (payload) => {
        this.roleAssignments.push(payload);
        return payload;
      },
    };
    this.userRole = {
      findMany: async () => this.roles,
    };
    this.plugin = {
      upsert: async (payload) => {
        this.plugins.push(payload);
        return payload;
      },
    };
    this.capabilities = [];
    this.roleAssignments = [];
    this.plugins = [];
  }
}

test("seedPlugins upserts plugin metadata and capability definitions", async () => {
  const mock = new MockPrisma(rbac.roles || []);
  const tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), "sv-cap-state-"));
  const statePath = path.join(tmpDir, "capabilities.json");
  const logger = { log() {}, warn() {}, error() {} };

  await seedPlugins({ prisma: mock, logger, statePath });

  assert.ok(mock.capabilities.length > 0, "captures capability upserts");
  assert.ok(mock.roleAssignments.length > 0, "captures role-capability upserts");
  assert.ok(mock.plugins.length > 0, "captures plugin upserts");
  const stateRaw = await fs.readFile(statePath, "utf8");
  const state = JSON.parse(stateRaw);
  assert.ok(state.signature && typeof state.signature === "string");
  assert.ok(Array.isArray(state.capabilities) && state.capabilities.length > 0);
});
