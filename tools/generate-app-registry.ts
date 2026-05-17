import fs from "node:fs";
import path from "node:path";

import { validateManifest } from "../packages/manifest/src/validate";
import type { SovereignAppManifest } from "../packages/manifest/src";

const ROOT_DIR = process.cwd();
const PLUGINS_DIR = path.join(ROOT_DIR, "plugins");
const OUTPUT_DIR = path.join(ROOT_DIR, "platform/generated");
const APPS_OUTPUT_FILE = path.join(
  OUTPUT_DIR,
  "apps.generated.ts"
);
const PERMISSIONS_OUTPUT_FILE = path.join(
  OUTPUT_DIR,
  "permissions.generated.ts"
);
const STANDALONE_APPS_OUTPUT_FILE = path.join(
  OUTPUT_DIR,
  "standalone-apps.generated.tsx"
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
  const app = {
    ...entry.manifest,
    pluginDirectory: entry.pluginDirectory,
  };
  const manifestJson = JSON.stringify(app, null, 2);

  if (
    entry.manifest.runtime === "standalone" &&
    entry.manifest.runtimeConfig?.engine === "react"
  ) {
    return `${manifestJson.slice(0, -1)},\n  module: () => import("./standalone-apps.generated").then((module) => ({ default: module.${toComponentName(entry.manifest.id)} }))\n}`;
  }

  return manifestJson;
}

function generateRegistryFile(installedApps: InstalledAppEntry[]) {
  const serializedApps = installedApps
    .map((entry) => serializeInstalledApp(entry))
    .join(",\n  ");

  const content = `// AUTO-GENERATED FILE. DO NOT EDIT.\n\nimport type { InstalledSovereignApp } from "../src/runtime";\n\nexport const installedApps = [\n  ${serializedApps}\n] as const satisfies readonly InstalledSovereignApp[];\n`;

  fs.mkdirSync(OUTPUT_DIR, { recursive: true });

  fs.writeFileSync(APPS_OUTPUT_FILE, content, "utf-8");
}

function generatePermissionsFile(installedApps: InstalledAppEntry[]) {
  const permissionMap = Object.fromEntries(
    installedApps.map(({ manifest }) => [
      manifest.id,
      [...manifest.permissions].sort(),
    ])
  );

  const content = `// AUTO-GENERATED FILE. DO NOT EDIT.\n\nimport type { SovereignPermission } from "../../packages/manifest/src";\n\nexport const appPermissions: Readonly<Record<string, readonly SovereignPermission[]>> = ${JSON.stringify(permissionMap, null, 2)};\n`;

  fs.mkdirSync(OUTPUT_DIR, { recursive: true });

  fs.writeFileSync(PERMISSIONS_OUTPUT_FILE, content, "utf-8");
}

function generateStandaloneAppsFile(installedApps: InstalledAppEntry[]) {
  const standaloneApps = installedApps.filter(
    ({ manifest }) =>
      manifest.runtime === "standalone" &&
      manifest.runtimeConfig?.engine === "react"
  );

  const imports = standaloneApps
    .map(
      ({ pluginDirectory }, index) =>
        `import StandaloneApp${index} from "../../plugins/${pluginDirectory}/src";`
    )
    .join("\n");

  const components = standaloneApps
    .map(
      ({ manifest }, index) =>
        `export function ${toComponentName(manifest.id)}() {\n  const sdk = createAppSdk({ appId: "${manifest.id}" });\n\n  return <StandaloneApp${index} sdk={sdk} />;\n}`
    )
    .join("\n\n");

  const content = `"use client";\n\nimport { createAppSdk } from "../src/sdk";\n${imports ? `\n${imports}\n` : ""}${components}\n`;

  fs.mkdirSync(OUTPUT_DIR, { recursive: true });

  fs.writeFileSync(STANDALONE_APPS_OUTPUT_FILE, content, "utf-8");
}

function toComponentName(appId: string) {
  return `${appId
    .split(/[^a-zA-Z0-9]/)
    .filter(Boolean)
    .map((segment) => `${segment[0]?.toUpperCase() ?? ""}${segment.slice(1)}`)
    .join("")}StandaloneApp`;
}

function main() {
  console.log("Generating Sovereign app registry...");

  const installedApps = readInstalledApps();

  generateRegistryFile(installedApps);
  generatePermissionsFile(installedApps);
  generateStandaloneAppsFile(installedApps);

  console.log(
    `Generated platform/generated metadata with ${installedApps.length} app(s)`
  );
}

main();
