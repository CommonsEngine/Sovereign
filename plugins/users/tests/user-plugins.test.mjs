/* eslint-disable n/no-unsupported-features/node-builtins */
import test from "node:test";
import assert from "node:assert/strict";

import { applyUserPluginUpdates, getUserPluginSnapshot } from "../services/user-plugins.js";

class MockPrisma {
  constructor({ plugins = [], overrides = [] } = {}) {
    this.plugins = [...plugins];
    this.overrides = [...overrides];

    this.plugin = {
      findMany: async ({ where } = {}) => {
        if (where && where.enabled === true) {
          return this.plugins.filter((p) => p.enabled !== false);
        }
        return [...this.plugins];
      },
    };

    this.userPlugin = {
      findMany: async ({ where } = {}) => {
        if (!where?.userId) return [...this.overrides];
        const ids = Array.isArray(where.userId.in) ? where.userId.in : [where.userId];
        return this.overrides.filter((ovr) => ids.includes(ovr.userId));
      },
      upsert: async ({ where, update, create }) => {
        const key = where?.userId_pluginId;
        const idx = this.overrides.findIndex(
          (ovr) => ovr.userId === key.userId && ovr.pluginId === key.pluginId
        );
        if (idx !== -1) {
          this.overrides[idx] = { ...this.overrides[idx], ...update };
          return this.overrides[idx];
        }
        const next = { ...create };
        this.overrides.push(next);
        return next;
      },
      delete: async ({ where }) => {
        const key = where?.userId_pluginId;
        this.overrides = this.overrides.filter(
          (ovr) => !(ovr.userId === key.userId && ovr.pluginId === key.pluginId)
        );
      },
    };
  }
}

const samplePlugins = [
  {
    id: "core",
    pluginId: "@core/users",
    namespace: "users",
    name: "Users",
    enabled: true,
    corePlugin: true,
    enrollStrategy: "auto",
  },
  {
    id: "optin",
    pluginId: "@demo/optin",
    namespace: "optin",
    name: "Opt-in",
    enabled: true,
    corePlugin: false,
    enrollStrategy: "subscribe",
  },
  {
    id: "defaultOn",
    pluginId: "@demo/default",
    namespace: "default",
    name: "Default On",
    enabled: true,
    corePlugin: false,
    enrollStrategy: "auto",
  },
];

test.describe("plugin:@sovereign/users", () => {
  test("enabling an opt-in plugin creates an override and surfaces in snapshot", async () => {
    const prisma = new MockPrisma({ plugins: samplePlugins });

    const { updated, snapshot } = await applyUserPluginUpdates(
      "user-1",
      [{ namespace: "optin", enabled: true }],
      { prisma }
    );

    assert.equal(updated, 1);
    assert.ok(snapshot.enabled.includes("optin"));
    assert.equal(snapshot.plugins.find((p) => p.namespace === "optin").enabled, true);
    assert.equal(prisma.overrides.length, 1, "override stored");
  });

  test.describe("core and default behavior", () => {
    test("refuses to disable core plugins", async () => {
      const prisma = new MockPrisma({ plugins: samplePlugins });

      const result = await applyUserPluginUpdates(
        "user-2",
        [{ namespace: "users", enabled: false }],
        { prisma }
      );

      assert.equal(result.updated, 0);
      const snapshot = await getUserPluginSnapshot("user-2", { prisma });
      assert.ok(snapshot.enabled.includes("users"), "core plugin remains enabled");
      assert.equal(prisma.overrides.length, 0, "no override stored");
    });

    test("clears disable override to restore default-on plugin", async () => {
      const prisma = new MockPrisma({
        plugins: samplePlugins,
        overrides: [{ userId: "user-3", pluginId: "defaultOn", enabled: false }],
      });

      const { updated } = await applyUserPluginUpdates(
        "user-3",
        [{ namespace: "default", enabled: true }],
        { prisma }
      );

      assert.equal(updated, 1, "override removal counted as update");
      const snapshot = await getUserPluginSnapshot("user-3", { prisma });
      assert.ok(snapshot.enabled.includes("default"), "default-on restored");
      assert.equal(
        snapshot.plugins.find((p) => p.namespace === "default").overridden,
        false,
        "override cleared"
      );
      assert.equal(prisma.overrides.length, 0, "override deleted");
    });
  });
});
