import fs from "node:fs";
import path from "node:path";

const pkgPath = path.resolve(process.cwd(), "package.json");

let pkg = {};
try {
  const contents = fs.readFileSync(pkgPath, "utf8");
  pkg = JSON.parse(contents);
} catch (err) {
  pkg = {};
}

export default pkg;
