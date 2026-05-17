

import fs from "node:fs";
import path from "node:path";

import { validateManifest } from "../packages/manifest/src/validate";
import type { SovereignAppManifest } from "../packages/manifest/src";

const ROOT_DIR = process.cwd();
const PLUGINS_DIR = path.join(ROOT_DIR, "plugins");
const OUTPUT_DIR = path.join(ROOT_DIR, "platform/generated");
const OUTPUT_FILE = path.join(
  OUTPUT_DIR,
  "apps.generated.ts"
);

interface InstalledAppEntry {
  manifest: SovereignAppManifest;
  pluginDirectory: string;
}

function readInstalledApps(): InstalledAppEntry[] {
  if (!fs.existsSync(PLUGINS_DIR)) {
    return [];
  }

  const pluginDirectories = fs
    .readdirSync(PLUGINS_DIR)
    .filter((entry) => {
      const fullPath = path.join(PLUGINS_DIR, entry);

      return fs.statSync(fullPath).isDirectory();
    });

  const installedApps: InstalledAppEntry[] = [];

  for (const pluginDirectory of pluginDirectories) {
    const manifestPath = path.join(
      PLUGINS_DIR,
      pluginDirectory,
      "manifest.json"
    );

    if (!fs.existsSync(manifestPath)) {
      console.warn(
        `Skipping ${pluginDirectory}: manifest.json not found`
      );

      continue;
    }

    const raw = fs.readFileSync(manifestPath, "utf-8");
    const manifest = JSON.parse(raw);

    const result = validateManifest(manifest);

    if (!result.valid) {
      console.error(
        `\nManifest validation failed for ${pluginDirectory}\n`
      );

      for (const error of result.errors) {
        console.error(
          `${error.instancePath || "/"} ${error.message}`
        );
      }

      process.exit(1);
    }

    installedApps.push({
      manifest: manifest as SovereignAppManifest,
      pluginDirectory,
    });
  }

  return installedApps;
}

function serializeInstalledApp(entry: InstalledAppEntry) {
  const manifestJson = JSON.stringify(entry.manifest, null, 2);

  return `${manifestJson.slice(0, -1)},\n  module: () => import("../../plugins/${entry.pluginDirectory}/src")\n}`;
}

function generateRegistryFile(installedApps: InstalledAppEntry[]) {
  const serializedApps = installedApps
    .map((entry) => serializeInstalledApp(entry))
    .join(",\n  ");

  const content = `// AUTO-GENERATED FILE. DO NOT EDIT.\n\nimport type { InstalledSovereignApp } from "../src/runtime";\n\nexport const installedApps = [\n  ${serializedApps}\n] as const satisfies readonly InstalledSovereignApp[];\n`;

  fs.mkdirSync(OUTPUT_DIR, { recursive: true });

  fs.writeFileSync(OUTPUT_FILE, content, "utf-8");
}

function main() {
  console.log("Generating Sovereign app registry...");

  const installedApps = readInstalledApps();

  generateRegistryFile(installedApps);

  console.log(
    `Generated platform/generated/apps.generated.ts with ${installedApps.length} app(s)`
  );
}

main();
