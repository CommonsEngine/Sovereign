import test from "node:test";
import assert from "node:assert/strict";

import {
  seedPluginRuntimeState,
  updatePluginRuntimeState,
  isPluginEnabled,
} from "$/ext-host/plugin-state.js";

test("seedPluginRuntimeState populates namespace and pluginId maps", () => {
  seedPluginRuntimeState({
    blog: { namespace: "blog", pluginId: "p_blog", enabled: true },
    tasks: { namespace: "tasks", pluginId: "p_tasks", enabled: false },
  });

  assert.equal(isPluginEnabled("blog"), true);
  assert.equal(isPluginEnabled("p_blog"), true);
  assert.equal(isPluginEnabled("tasks"), false);
  assert.equal(isPluginEnabled("p_tasks"), false);
});

test("updatePluginRuntimeState toggles existing entries", () => {
  seedPluginRuntimeState({ blog: { namespace: "blog", pluginId: "p_blog", enabled: true } });

  updatePluginRuntimeState({ namespace: "blog", pluginId: "p_blog", enabled: false });
  assert.equal(isPluginEnabled("blog"), false);
  assert.equal(isPluginEnabled("p_blog"), false);

  updatePluginRuntimeState({ namespace: "blog", enabled: true });
  assert.equal(isPluginEnabled("blog"), true);
});

test("isPluginEnabled defaults to true for unknown refs", () => {
  seedPluginRuntimeState({});
  assert.equal(isPluginEnabled("nonexistent"), true);
});
