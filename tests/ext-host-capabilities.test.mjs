import path from "node:path";
import test from "node:test";
import assert from "node:assert/strict";

const repoRoot = path.resolve(new URL("..", import.meta.url).pathname);
process.env.ROOT_DIR ||= repoRoot;
process.env.PLUGIN_DIR ||= path.join(repoRoot, "plugins");
process.env.DATA_DIR ||= path.join(repoRoot, "data");
process.env.NODE_ENV ||= "test";

const MODULE_URL = new URL("../platform/src/ext-host/capabilities.mjs", import.meta.url);

function resetDevFlag(value) {
  if (value === undefined) {
    delete process.env.DEV_ALLOW_ALL_CAPS;
  } else {
    process.env.DEV_ALLOW_ALL_CAPS = value;
  }
}

async function freshModule() {
  const cacheBustingUrl = new URL(MODULE_URL.href + `?t=${Date.now()}-${Math.random()}`);
  return import(cacheBustingUrl.href);
}

test("throws when plugin requests unknown capability", async () => {
  resetDevFlag("false");
  const { resolvePluginCapabilities } = await freshModule();

  assert.throws(() =>
    resolvePluginCapabilities(
      { namespace: "blog", sovereign: { platformCapabilities: { imaginary: true } } },
      { config: { IS_PROD: false }, logger: console }
    )
  );
});

test("denies prod-disabled capability", async () => {
  resetDevFlag("false");
  const { resolvePluginCapabilities } = await freshModule();

  assert.throws(() =>
    resolvePluginCapabilities(
      { namespace: "blog", sovereign: { platformCapabilities: { fileUpload: true } } },
      { config: { IS_PROD: true }, logger: console }
    )
  );
});

test("DEV_ALLOW_ALL_CAPS grants all capabilities in dev", async () => {
  resetDevFlag("true");
  const { resolvePluginCapabilities, getCapabilityRegistry } = await freshModule();

  const { context, granted } = resolvePluginCapabilities(
    { namespace: "blog", sovereign: { platformCapabilities: {} } },
    { config: { IS_PROD: false }, logger: { warn() {}, info() {} } }
  );

  const registryKeys = Object.keys(getCapabilityRegistry());
  assert.deepEqual(granted.sort(), registryKeys.sort());
  assert.ok(context.prisma, "should attach prisma when allow-all");
});

test("resolvePluginCapabilities injects declared host services", async () => {
  resetDevFlag("false");
  const { resolvePluginCapabilities } = await freshModule();
  const plugin = {
    namespace: "blog",
    sovereign: {
      platformCapabilities: {
        uuid: true,
      },
    },
  };
  const { context, granted } = resolvePluginCapabilities(plugin, {
    config: { IS_PROD: false },
    logger: console,
  });
  assert.ok(context.uuid, "uuid helper injected");
  assert.deepEqual(granted, ["uuid"]);
});
