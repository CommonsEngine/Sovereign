/* eslint-disable import/order */
import { promises as fs } from "node:fs";
import path from "node:path";
import fg from "fast-glob";
import { execa } from "execa";

const root = process.cwd();
const base = path.join(root, "platform/prisma/base.prisma");
const out = path.join(root, "platform/prisma/schema.prisma");

// 1) Read base
const baseSDL = await fs.readFile(base, "utf8");

// 2) Collect plugin extensions
const extFiles = await fg("plugins/*/prisma/extension.prisma", { cwd: root, absolute: true });
const parts = await Promise.all(extFiles.map((f) => fs.readFile(f, "utf8")));

const banner = `/// GENERATED FILE — DO NOT EDIT
/// Combined on ${new Date().toISOString()}
`;

const combined = [banner, baseSDL, ...parts].join("\n\n");

// 3) Write combined schema
await fs.writeFile(out, combined, "utf8");

// 4) Format (optional but nice)
await execa(
  "yarn",
  [
    "workspace",
    "@sovereign/platform",
    "prisma",
    "format",
    "--schema",
    "platform/prisma/schema.prisma",
  ],
  { stdio: "inherit" }
);

console.log(`✓ Wrote composed schema with ${parts.length} plugin extension(s): ${out}`);
