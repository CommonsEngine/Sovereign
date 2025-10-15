import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const ALIAS_PREFIX = "$/";
const projectRoot = path.dirname(fileURLToPath(import.meta.url));
const aliasRoot = path.join(projectRoot, "..", "src");

export async function resolve(specifier, context, defaultResolve) {
  if (specifier.startsWith(ALIAS_PREFIX)) {
    const relativePath = specifier.slice(ALIAS_PREFIX.length);
    const resolvedPath = path.join(aliasRoot, relativePath);
    const url = pathToFileURL(resolvedPath).href;
    return { url, shortCircuit: true };
  }

  return defaultResolve(specifier, context, defaultResolve);
}

export async function load(url, context, defaultLoad) {
  return defaultLoad(url, context, defaultLoad);
}
