import crypto from "crypto";

export function uuid(prefix = "", salt = "") {
  // Target: total length ≤ 32, allowed chars [A-Za-z0-9_-]
  const maxTotal = 32;
  const ts = Date.now().toString(36); // ~8–9 chars
  const rand = crypto.randomBytes(4).toString("base64url"); // 6 chars, url-safe

  // Optional short digest from salt to add entropy while keeping it compact
  const extra = salt
    ? crypto
        .createHash("sha1")
        .update(salt + ts + rand)
        .digest("base64url")
        .slice(0, 6)
    : "";

  // Build core and ensure only allowed characters, then clamp to budget
  const maxCore = Math.max(3, maxTotal - String(prefix).length);
  const core = `${ts}${rand}${extra}`
    .replace(/[^A-Za-z0-9_-]/g, "")
    .slice(0, maxCore);

  return `${prefix}${core}`.trim();
}
