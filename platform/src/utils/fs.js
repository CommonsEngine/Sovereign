import fs from "node:fs";

export function readJson(fp) {
  let output = {};

  try {
    const contents = fs.readFileSync(fp, "utf8");
    output = JSON.parse(contents);
  } catch {
    output = {};
  }

  return output;
}
