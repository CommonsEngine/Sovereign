/* eslint-disable import/order */
import { promises as fs } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import fg from "fast-glob";
import { execa } from "execa";

const args = process.argv.slice(2);
const isCheck = args.includes("--check");
const shouldFormat = !args.includes("--no-format") && !isCheck;

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, "..");
const base = path.join(root, "platform/prisma/base.prisma");
const out = path.join(root, "platform/prisma/schema.prisma");
const platformRoot = path.join(root, "platform");
const workspaceSchemaPath = path.relative(platformRoot, out).split(path.sep).join(path.posix.sep);

const forbiddenBlock = /^\s*(datasource|generator)\s+\w*\s*\{/im;

const banner = `/// GENERATED FILE — DO NOT EDIT
/// Combined on ${new Date().toISOString()}
`;

const extFiles = (
  await fg("plugins/*/prisma/extension.prisma", { cwd: root, absolute: true })
).sort((a, b) => {
  const aName = pluginName(a);
  const bName = pluginName(b);
  return aName.localeCompare(bName) || a.localeCompare(b);
});

function pluginName(file) {
  const rel = path.relative(root, file);
  const segments = rel.split(path.sep);
  const idx = segments.indexOf("plugins");
  if (idx !== -1 && idx + 1 < segments.length) {
    return segments[idx + 1];
  }
  return path.basename(path.dirname(file));
}

function ensureValidExtension(sdl, relPath) {
  const match = sdl.match(forbiddenBlock);
  if (match) {
    const blockName = match[1];
    throw new Error(
      `[prisma:compose] "${relPath}" attempts to declare a ${blockName} block. Plugin extensions may only contain models, enums, or type aliases.`
    );
  }
}

const baseSDL = await fs.readFile(base, "utf8");

const pluginParts = await Promise.all(
  extFiles.map(async (file) => {
    const rel = path.relative(root, file);
    const name = pluginName(file);

    // Check plugin.json for database mode
    const pluginDir = path.dirname(file); // .../plugins/name/prisma
    const manifestPath = path.join(pluginDir, "..", "plugin.json");
    try {
      const manifestContent = await fs.readFile(manifestPath, "utf8");
      const manifest = JSON.parse(manifestContent);
      const dbMode = manifest?.sovereign?.database?.mode || "shared";

      if (dbMode === "dedicated") {
        console.log(`[prisma:compose] Skipping dedicated database plugin: ${name}`);
        return null;
      }
    } catch (err) {
      if (err.code !== "ENOENT") {
        console.warn(
          `[prisma:compose] Warning: Could not read plugin.json for ${name}: ${err.message}`
        );
      }
      // If no plugin.json, assume shared/legacy behavior
    }

    const sdl = await fs.readFile(file, "utf8");
    ensureValidExtension(sdl, rel);
    const body = sdl.trim();
    const header = [`/// --- Plugin: ${name} ---`, `/// Source: ${rel}`].join("\n");
    const section = body ? `${header}\n\n${body}` : header;
    return { name, rel, section };
  })
);

const pieces = [
  banner.trimEnd(),
  baseSDL.trimEnd(),
  ...pluginParts.filter(Boolean).map((part) => part.section.trimEnd()),
].filter(Boolean);
const combined = `${pieces.join("\n\n")}\n`;

if (isCheck) {
  let existing = "";
  try {
    existing = await fs.readFile(out, "utf8");
  } catch (err) {
    if (err.code !== "ENOENT") throw err;
  }
  if (existing.trimEnd() !== combined.trimEnd()) {
    console.error(
      `[prisma:compose] ${path.relative(root, out)} is out of date. Re-run "yarn prisma:compose" and commit the result.`
    );
    process.exit(1);
  }
  console.log(`✓ Prisma schema is up-to-date (${pluginParts.length} plugin extension(s))`);
  process.exit(0);
}

await fs.writeFile(out, combined, "utf8");

if (shouldFormat) {
  await execa(
    "yarn",
    ["workspace", "@sovereign/platform", "prisma", "format", "--schema", workspaceSchemaPath],
    { stdio: "inherit", cwd: root }
  );
}

console.log(
  `✓ Wrote composed schema with ${pluginParts.length} plugin extension(s): ${path.relative(root, out)}`
);
