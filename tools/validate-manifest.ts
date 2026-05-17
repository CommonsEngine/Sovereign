import fs from "node:fs";
import path from "node:path";

import { validateManifest } from "../packages/manifest/src/validate";

const manifestPath = process.argv[2];

if (!manifestPath) {
  console.error("Missing manifest path");
  process.exit(1);
}

const absolutePath = path.resolve(manifestPath);

const raw = fs.readFileSync(absolutePath, "utf-8");

const manifest = JSON.parse(raw);

const result = validateManifest(manifest);

if (!result.valid) {
  console.error("Manifest validation failed\n");

  for (const error of result.errors) {
    console.error(
      `${error.instancePath || "/"} ${error.message}`
    );
  }

  process.exit(1);
}

console.log("Manifest is valid");