/*
 * Minimal OpenAPI spec validator for generated openapi.json.
 * Intentionally lightweight: structural checks + common pitfalls.
 * Exit code 0 on success, 1 on any error.
 */
import fs from "node:fs";
import path from "node:path";

const cwd = process.cwd();
const specPath = path.join(cwd, "openapi.json");

function fail(msg) {
  console.error(`✗ ${msg}`);
  process.exitCode = 1;
}

function warn(msg) {
  console.warn(`⚠️  ${msg}`);
}

function ok(msg) {
  console.log(`✓ ${msg}`);
}

(async () => {
  let raw;
  try {
    raw = await fs.promises.readFile(specPath, "utf8");
    // eslint-disable-next-line no-unused-vars
  } catch (e) {
    fail(`openapi.json not found at ${specPath}`);
    return;
  }

  let spec;
  try {
    spec = JSON.parse(raw);
  } catch (e) {
    fail(`Invalid JSON: ${e.message}`);
    return;
  }

  // Basic required top-level fields
  if (!spec.openapi) fail('Missing "openapi" version string');
  else if (!/^3\.0\./.test(spec.openapi))
    warn(`Unexpected openapi version '${spec.openapi}' (expected 3.0.x)`);

  if (!spec.info || typeof spec.info !== "object") fail("Missing info object");
  else {
    if (!spec.info.title) fail("info.title missing");
    if (!spec.info.version) fail("info.version missing");
  }

  if (!spec.paths || typeof spec.paths !== "object") {
    fail("paths object missing");
  } else {
    const pathKeys = Object.keys(spec.paths);
    if (pathKeys.length === 0) warn("No API paths detected");

    for (const p of pathKeys) {
      if (!p.startsWith("/")) warn(`Path key '${p}' should start with '/'`);
      const methodsObj = spec.paths[p];
      if (!methodsObj || typeof methodsObj !== "object") {
        warn(`Path '${p}' has invalid value (expected object)`);
        continue;
      }
      const methodKeys = Object.keys(methodsObj).filter((m) => !m.startsWith("x-"));
      if (methodKeys.length === 0) warn(`Path '${p}' defines no operations`);
      for (const m of methodKeys) {
        const op = methodsObj[m];
        if (!op || typeof op !== "object") {
          warn(`Operation ${m.toUpperCase()} ${p} invalid (expected object)`);
          continue;
        }
        if (!op.responses || typeof op.responses !== "object") {
          fail(`Operation ${m.toUpperCase()} ${p} missing responses`);
          continue;
        }
        // Ensure at least one success code (200/201/204) present
        const codes = Object.keys(op.responses);
        if (!codes.some((c) => /^(200|201|204)$/.test(c))) {
          warn(`Operation ${m.toUpperCase()} ${p} has no 200/201/204 response`);
        }
      }
    }
  }

  if (process.exitCode === 1) {
    console.error("OpenAPI validation failed.");
  } else {
    ok("OpenAPI validation passed");
  }
})();
