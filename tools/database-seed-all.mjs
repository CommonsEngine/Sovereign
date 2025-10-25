/* eslint-disable import/order */
import fg from "fast-glob";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.dirname(fileURLToPath(import.meta.url));
const matches = await fg("../plugins/*/prisma/seeds.mjs", { cwd: root, absolute: true });
for (const f of matches) {
  const mod = await import(f);
  if (typeof mod.seed === "function") {
    console.log("🌱 Seeding:", f);
    await mod.seed();
  }
}
console.log("✓ Plugin seeds done");
