import path from "node:path";
import url from "node:url";

const __dirname = path.dirname(url.fileURLToPath(import.meta.url));

function createLogger(context, level, message, meta) {
  const logger = context?.logger;
  if (logger?.[level]) {
    logger[level](message, meta);
  } else {
    const payload = meta ? `${message} ${JSON.stringify(meta)}` : message;
    console.log(`[{{NAMESPACE}}:${level}] ${payload}`);
  }
}

export async function onInstall(context = {}) {
  createLogger(context, "info", "{{DISPLAY_NAME}} plugin installed");
  return { action: "onInstall" };
}

export async function onEnable(context = {}) {
  createLogger(context, "info", "{{DISPLAY_NAME}} plugin enabled");
  return { action: "onEnable" };
}

export async function onDisable(context = {}) {
  createLogger(context, "info", "{{DISPLAY_NAME}} plugin disabled");
  return { action: "onDisable" };
}

export function getRoutes(context = {}) {
  return {
    api: () => import("./routes/api/index.js").then((mod) => mod.default(context)),
    web: () => import("./routes/web/index.js").then((mod) => mod.default(context)),
  };
}

export function getPublicDir() {
  return path.resolve(__dirname, "public");
}

export default {
  onInstall,
  onEnable,
  onDisable,
  getRoutes,
  getPublicDir,
};
