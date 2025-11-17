#!/usr/bin/env node
import { promises as fs } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, resolve, basename, join, relative, extname } from "node:path";
import process from "node:process";
import { tmpdir } from "node:os";
import { execFile } from "node:child_process";
import { createHash } from "node:crypto";
import { promisify } from "node:util";
import { createRequire } from "module";

const require = createRequire(import.meta.url);
const pkg = require("../package.json");

// robust side-effect import relative to this file
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const registerAliasCandidates = [
  resolve(__dirname, "../scripts/register-alias.mjs"),
  resolve(__dirname, "../platform/scripts/register-alias.mjs"),
];

process.env.ROOT_DIR = process.env.ROOT_DIR || resolve(__dirname, "..");
process.env.SV_SKIP_ENV_REFRESH = process.env.SV_SKIP_ENV_REFRESH || "1";

let aliasLoaded = false;
for (const candidate of registerAliasCandidates) {
  try {
    await import(candidate);
    aliasLoaded = true;
    break;
  } catch (err) {
    if (err?.code === "ERR_MODULE_NOT_FOUND" || /Cannot find module/i.test(err?.message || "")) {
      continue;
    }
    throw err;
  }
}

if (!aliasLoaded) {
  console.warn(
    "⚠️  Could not load register-alias.mjs (checked root and platform). CLI paths may not resolve."
  );
}

// Now that aliases are registered, import modules that rely on "$/" paths
const { prisma } = await import("../platform/src/services/database.js");
const {
  createInvite: createInviteRecord,
  deriveInviteStatus,
  serializeInvite,
} = await import("../platform/src/services/invites.js");

const BUILD_MANIFEST_SCRIPT = resolve(__dirname, "../tools/build-manifest.mjs");
const PLUGINS_UPDATE_SCRIPT = resolve(__dirname, "../tools/plugins-update.mjs");
const PLUGINS_REMOVE_SCRIPT = resolve(__dirname, "../tools/plugins-remove.mjs");
const MANIFEST_PATH = resolve(__dirname, "../manifest.json");
const PLUGINS_DIR = resolve(__dirname, "../plugins");
const execFileAsync = promisify(execFile);
const COPY_SKIP_DIRS = new Set([".git", ".hg", ".svn"]);
const COPY_SKIP_FILES = new Set([".DS_Store"]);
const CHECKSUM_SKIP_DIRS = new Set(COPY_SKIP_DIRS);
const CHECKSUM_SKIP_FILES = new Set(COPY_SKIP_FILES);
const CORE_MIGRATIONS_DIR = resolve(__dirname, "../platform/prisma/migrations");
const MIGRATION_STATE_PATH = resolve(__dirname, "../data/.sv-migrations-state.json");
const PLUGIN_TEMPLATES_DIR = resolve(__dirname, "../tools/plugin-templates");
const PLUGIN_TEMPLATE_MAP = {
  js: resolve(PLUGIN_TEMPLATES_DIR, "js"),
  react: resolve(PLUGIN_TEMPLATES_DIR, "react"),
};
const SUPPORTED_PLUGIN_FRAMEWORKS = Object.keys(PLUGIN_TEMPLATE_MAP);
const SUPPORTED_PLUGIN_TYPES = ["module", "project"];
const TEMPLATE_TEXT_EXTENSIONS = new Set([
  ".json",
  ".js",
  ".mjs",
  ".cjs",
  ".jsx",
  ".ts",
  ".tsx",
  ".md",
  ".txt",
  ".html",
  ".css",
  ".prisma",
]);

// tiny args parser
function parseArgs(argv) {
  const out = { _: [], flags: {} };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a.startsWith("--")) {
      const [k, v] = a.slice(2).split("=");
      if (v !== undefined) out.flags[k] = v;
      else if (i + 1 < argv.length && !argv[i + 1].startsWith("-")) out.flags[k] = argv[++i];
      else out.flags[k] = true;
    } else if (a.startsWith("-")) {
      // short flags, e.g. -hv
      a.slice(1)
        .split("")
        .forEach((ch) => (out.flags[ch] = true));
    } else out._.push(a);
  }
  return out;
}

function printUsage() {
  console.log(`
    Usage:
      sv [options] <namespace> <command> [args]

    Namespaces & commands:
      invites
        create --role <key> [--tenant TID] [--project PID] [--max-uses N] [--mode single|unlimited] [--expires <date>] [--email <addr>] [--domain <domain>]
        list [--json] [--tenant TID] [--project PID] [--active|--expired|--revoked]
        revoke <inviteId>

      plugins
        add <spec>                      Register/install a plugin (git url | file path)
        list [--json] [--enabled|--disabled]
        enable <namespace>
        disable <namespace>
        remove <namespace>
        show <namespace> [--json]
        validate <path>

      migrate
        deploy [--plugin <id>] [--dry-run]
        status [--plugin <id>] [--json]
        generate [--plugin <id>]

      manifest
        generate                      Build manifest.json
        show [--json]                 Print manifest summary or raw JSON

    Global options:
      -h, --help       Show help (also: sv <ns> --help)
      -v, --version    Show version
      --json           JSON output where supported
      --verbose        Increase log verbosity
      --quiet          Suppress non-essential output
      --dry-run        Simulate mutating commands
      --no-color       Disable ANSI colors
  `);
}

function exitUsage(msg) {
  if (msg) console.error(msg);
  printUsage();
  process.exit(2);
}

function parseInviteMaxUses(input, modeRaw) {
  const mode = typeof modeRaw === "string" ? modeRaw.toLowerCase() : "";
  if (mode === "single") return 1;
  if (mode === "unlimited") return null;
  if (input === undefined || input === null) return null;
  const num = Number(input);
  if (!Number.isFinite(num) || num <= 0) return null;
  return Math.floor(num);
}

function parseInviteExpiry(input) {
  if (!input) return null;
  const dt = input instanceof Date ? input : new Date(input);
  return Number.isNaN(dt.getTime()) ? null : dt;
}

function printNamespaceHelp(ns) {
  const node = commands[ns];
  if (node && typeof node.__help__ === "string") {
    console.log(node.__help__);
  } else {
    printUsage();
  }
}

async function runManifestBuild() {
  await import(BUILD_MANIFEST_SCRIPT);
}

async function runPluginTool(scriptPath, args = []) {
  const displayArgs = args.length ? ` ${args.join(" ")}` : "";
  console.log(`[plugins] running: node ${relative(process.cwd(), scriptPath)}${displayArgs}`);
  await execFileAsync("node", [scriptPath, ...args], { stdio: "inherit" });
}

async function runPluginsUpdateTool(args = []) {
  await runPluginTool(PLUGINS_UPDATE_SCRIPT, args);
}

async function runPluginsRemoveTool(args = []) {
  await runPluginTool(PLUGINS_REMOVE_SCRIPT, args);
}

async function readManifestFile() {
  let raw;
  try {
    raw = await fs.readFile(MANIFEST_PATH, "utf8");
  } catch (err) {
    if (err?.code === "ENOENT") {
      console.error(`Manifest not found at ${MANIFEST_PATH}. Run "sv manifest generate" first.`);
    } else {
      console.error(`Failed to read manifest: ${err?.message || err}`);
    }
    process.exit(1);
  }
  try {
    return JSON.parse(raw);
  } catch (err) {
    console.error(`Manifest is invalid JSON: ${err?.message || err}`);
    process.exit(1);
  }
}

function printManifestSummary(manifest) {
  const enabledPlugins = manifest.enabledPlugins || [];
  const modules = manifest.modules || [];
  const projects = manifest.projects || [];
  console.log(`Manifest path: ${MANIFEST_PATH}`);
  console.log(`Instance ID: ${manifest.instanceId || "(unknown)"}`);
  console.log(`Environment: ${manifest.env || "(unset)"}`);
  console.log(`Platform version: ${manifest.platform?.version || "(unknown)"}`);
  console.log(`CLI version: ${manifest.cli?.version || "(unknown)"}`);
  console.log(`Default tenant: ${manifest.defaultTenantId || "(unset)"}`);
  console.log(`Enabled plugins (${enabledPlugins.length}):`);
  if (enabledPlugins.length) {
    enabledPlugins.forEach((id) => console.log(`  - ${id}`));
  } else {
    console.log("  (none)");
  }
  console.log(
    `Modules (${modules.length}) / Projects (${projects.length}) | Allowed frameworks: ${
      (manifest.allowedPluginFrameworks || []).join(", ") || "(none)"
    }`
  );
  console.log(`Last updated: ${manifest.updatedAt || "(unknown)"}`);
}

async function pathExists(target) {
  try {
    await fs.access(target);
    return true;
  } catch {
    return false;
  }
}

function isGitSpec(spec = "") {
  return (
    /^(?:https?|git|ssh):/i.test(spec) ||
    spec.startsWith("git@") ||
    spec.endsWith(".git") ||
    spec.startsWith("git+")
  );
}

function parseGitSpec(spec) {
  const hashIndex = spec.indexOf("#");
  let repo = hashIndex === -1 ? spec : spec.slice(0, hashIndex);
  const ref = hashIndex === -1 ? null : spec.slice(hashIndex + 1) || null;
  if (repo.startsWith("git+")) {
    repo = repo.slice(4);
  }
  return { repo, ref };
}

async function execGit(args, options = {}) {
  try {
    await execFileAsync("git", args, { maxBuffer: 10 * 1024 * 1024, ...options });
  } catch (err) {
    const stderr = err?.stderr?.toString?.().trim();
    const stdout = err?.stdout?.toString?.().trim();
    const detail = stderr || stdout || err?.message || "unknown git error";
    throw new Error(`git ${args.join(" ")} failed: ${detail}`);
  }
}

async function resolvePluginSpec(spec) {
  let normalizedSpec = spec;
  if (typeof spec === "string" && spec.startsWith("file://")) {
    try {
      normalizedSpec = fileURLToPath(spec);
    } catch (err) {
      throw new Error(`Invalid file URL "${spec}": ${err?.message || err}`);
    }
  }

  if (isGitSpec(normalizedSpec)) {
    const { path, cleanup } = await cloneGitSpec(normalizedSpec);
    return { sourcePath: path, cleanup, provenance: spec, sourceType: "git" };
  }
  const absPath = resolve(process.cwd(), normalizedSpec);
  let stats;
  try {
    stats = await fs.stat(absPath);
  } catch (err) {
    if (err?.code === "ENOENT") {
      throw new Error(
        `Plugin spec "${spec}" does not exist (${absPath}). Pass a git URL or a directory path.`
      );
    }
    throw err;
  }
  if (!stats?.isDirectory?.()) {
    throw new Error(`Plugin spec must be a directory when using a path; received "${spec}".`);
  }
  return {
    sourcePath: absPath,
    cleanup: null,
    provenance: absPath,
    sourceType: "dir",
  };
}

async function cloneGitSpec(spec) {
  const { repo, ref } = parseGitSpec(spec);
  if (!repo) {
    throw new Error(`Invalid git spec "${spec}".`);
  }
  const tmpDir = await fs.mkdtemp(join(tmpdir(), "sv-plugin-"));
  await execGit(["clone", "--depth", "1", repo, tmpDir]);
  if (ref) {
    await execGit(["-C", tmpDir, "checkout", ref]);
  }
  return {
    path: tmpDir,
    cleanup: async () => {
      await fs.rm(tmpDir, { recursive: true, force: true });
    },
  };
}

async function readPluginManifest(sourceDir) {
  const manifestPath = resolve(sourceDir, "plugin.json");
  let raw;
  try {
    raw = await fs.readFile(manifestPath, "utf8");
  } catch (err) {
    if (err?.code === "ENOENT") {
      throw new Error(`plugin.json not found in ${sourceDir}`);
    }
    throw err;
  }
  let manifest;
  try {
    manifest = JSON.parse(raw);
  } catch (err) {
    throw new Error(`Invalid plugin manifest JSON at ${manifestPath}: ${err?.message || err}`);
  }
  const requiredFields = ["id", "name", "version", "framework", "type"];
  for (const field of requiredFields) {
    if (!manifest[field] || typeof manifest[field] !== "string") {
      throw new Error(`plugin.json is missing required field "${field}".`);
    }
  }
  if (!SUPPORTED_PLUGIN_FRAMEWORKS.includes(manifest.framework)) {
    throw new Error(`Unsupported plugin framework "${manifest.framework}".`);
  }
  if (!SUPPORTED_PLUGIN_TYPES.includes(manifest.type)) {
    throw new Error(`Unsupported plugin type "${manifest.type}".`);
  }
  return { manifest, manifestPath };
}

function deriveNamespace(manifest, fallbackDir) {
  if (manifest?.namespace && typeof manifest.namespace === "string") {
    const ns = manifest.namespace.trim();
    if (ns) return ns;
  }
  if (manifest?.id && manifest.id.includes("/")) {
    return manifest.id.split("/").pop();
  }
  if (fallbackDir) {
    return basename(fallbackDir);
  }
  throw new Error(`Unable to determine namespace for plugin "${manifest?.id || "unknown"}".`);
}

function assertValidNamespace(namespace) {
  if (!/^[A-Za-z0-9._-]+$/.test(namespace)) {
    throw new Error(
      `Namespace "${namespace}" is invalid. Use alphanumeric characters plus ".", "_", or "-".`
    );
  }
}

async function indexInstalledPlugins() {
  const byId = new Map();
  const byNamespace = new Map();
  let entries = [];
  try {
    entries = await fs.readdir(PLUGINS_DIR, { withFileTypes: true });
  } catch (err) {
    if (err?.code === "ENOENT") {
      return { byId, byNamespace };
    }
    throw err;
  }
  for (const entry of entries) {
    if (!entry.isDirectory?.()) continue;
    const pluginRoot = resolve(PLUGINS_DIR, entry.name);
    const manifestPath = resolve(pluginRoot, "plugin.json");
    try {
      const raw = await fs.readFile(manifestPath, "utf8");
      const manifest = JSON.parse(raw);
      const ns = manifest.namespace || entry.name;
      if (manifest.id) {
        byId.set(manifest.id, { dir: pluginRoot, namespace: ns });
      }
      if (ns) {
        byNamespace.set(ns, { dir: pluginRoot, id: manifest.id || entry.name, namespace: ns });
      }
    } catch {
      continue;
    }
  }
  return { byId, byNamespace };
}

async function copyPluginSource(sourceDir, targetDir) {
  await fs.mkdir(dirname(targetDir), { recursive: true });
  // eslint-disable-next-line n/no-unsupported-features/node-builtins
  await fs.cp(sourceDir, targetDir, {
    recursive: true,
    errorOnExist: true,
    force: false,
    filter: (src) => {
      const base = basename(src);
      if (COPY_SKIP_FILES.has(base) || COPY_SKIP_DIRS.has(base)) {
        return false;
      }
      return true;
    },
  });
}

async function hashDirectory(rootDir) {
  const hash = createHash("sha256");

  async function walk(dir) {
    let entries = await fs.readdir(dir, { withFileTypes: true });
    entries = entries.sort((a, b) => a.name.localeCompare(b.name));
    for (const entry of entries) {
      const entryName = entry.name;
      if (CHECKSUM_SKIP_FILES.has(entryName) || CHECKSUM_SKIP_DIRS.has(entryName)) {
        if (entry.isDirectory?.()) continue;
        if (entry.isFile?.()) continue;
        continue;
      }
      const fullPath = resolve(dir, entryName);
      if (entry.isDirectory?.()) {
        await walk(fullPath);
        continue;
      }
      if (!entry.isFile?.()) {
        continue;
      }
      const relPath = relative(rootDir, fullPath);
      hash.update(relPath);
      const data = await fs.readFile(fullPath);
      hash.update(data);
    }
  }

  await walk(rootDir);
  return hash.digest("hex");
}

async function resolvePluginTemplateDir(framework) {
  const normalized = String(framework || "").toLowerCase();
  const templatePath = PLUGIN_TEMPLATE_MAP[normalized];
  if (!templatePath) {
    throw new Error(
      `Unknown plugin template framework "${framework}". Expected one of ${SUPPORTED_PLUGIN_FRAMEWORKS.join(", ")}.`
    );
  }
  const exists = await pathExists(templatePath);
  if (!exists) {
    throw new Error(`Template directory missing at ${templatePath}.`);
  }
  return templatePath;
}

function toTitleCase(input) {
  if (!input) return "";
  return input
    .replace(/[-_]+/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .split(" ")
    .filter(Boolean)
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(" ");
}

function deriveDefaultPluginId(namespace) {
  if (!namespace) return "";
  if (namespace.startsWith("@")) {
    return namespace;
  }
  return `@sovereign/${namespace}`;
}

function formatLibraryGlobal(displayName, namespace) {
  const source = displayName || namespace || "Plugin";
  const cleaned = source
    .replace(/[^A-Za-z0-9]+/g, " ")
    .trim()
    .split(" ")
    .filter(Boolean)
    .map((segment) => segment.charAt(0).toUpperCase() + segment.slice(1))
    .join("");
  return cleaned || "SovereignPlugin";
}

async function copyPluginTemplate(framework, targetDir, replacements) {
  const templateDir = await resolvePluginTemplateDir(framework);
  await copyPluginSource(templateDir, targetDir);
  await replaceTemplatePlaceholders(targetDir, replacements);
  return templateDir;
}

async function replaceTemplatePlaceholders(rootDir, replacements) {
  async function walk(dir) {
    const entries = await fs.readdir(dir, { withFileTypes: true });
    for (const entry of entries) {
      const fullPath = resolve(dir, entry.name);
      if (entry.isDirectory?.()) {
        await walk(fullPath);
        continue;
      }
      if (!entry.isFile?.()) continue;
      if (!shouldProcessTemplateFile(fullPath)) continue;
      let content;
      try {
        content = await fs.readFile(fullPath, "utf8");
      } catch {
        continue;
      }
      let updated = content;
      for (const [key, value] of Object.entries(replacements)) {
        const token = `{{${key}}}`;
        if (updated.includes(token)) {
          updated = updated.split(token).join(String(value));
        }
      }
      if (updated !== content) {
        await fs.writeFile(fullPath, updated);
      }
    }
  }

  await walk(rootDir);
}

function shouldProcessTemplateFile(filePath) {
  const ext = extname(filePath).toLowerCase();
  return TEMPLATE_TEXT_EXTENSIONS.has(ext);
}

function createMigrationStateTemplate() {
  return { core: [], plugins: {} };
}

async function loadMigrationState() {
  try {
    const raw = await fs.readFile(MIGRATION_STATE_PATH, "utf8");
    const data = JSON.parse(raw);
    return {
      core: Array.isArray(data?.core) ? data.core : [],
      plugins: typeof data?.plugins === "object" && data.plugins ? data.plugins : {},
    };
  } catch (err) {
    if (err?.code === "ENOENT") {
      return createMigrationStateTemplate();
    }
    throw err;
  }
}

async function saveMigrationState(state) {
  const snapshot = {
    core: Array.isArray(state.core) ? state.core : [],
    plugins: typeof state.plugins === "object" && state.plugins ? state.plugins : {},
  };
  await fs.mkdir(dirname(MIGRATION_STATE_PATH), { recursive: true });
  await fs.writeFile(MIGRATION_STATE_PATH, `${JSON.stringify(snapshot, null, 2)}\n`);
}

async function collectMigrationDirs(rootDir) {
  let entries;
  try {
    entries = await fs.readdir(rootDir, { withFileTypes: true });
  } catch (err) {
    if (err?.code === "ENOENT") {
      return [];
    }
    throw err;
  }
  return entries
    .filter((entry) => entry.isDirectory?.())
    .map((entry) => ({
      name: entry.name,
      path: resolve(rootDir, entry.name),
    }))
    .sort((a, b) => a.name.localeCompare(b.name));
}

async function resolveMigrationTarget(selector) {
  if (!selector) {
    return {
      type: "core",
      id: "core",
      namespace: null,
      label: "core platform",
      migrationsDir: CORE_MIGRATIONS_DIR,
    };
  }

  const installed = await indexInstalledPlugins();
  const pluginMatch =
    installed.byId.get(selector) ||
    installed.byNamespace.get(selector) ||
    [...installed.byNamespace.values()].find((entry) => entry.namespace === selector);

  if (!pluginMatch) {
    console.error(`Unknown plugin "${selector}". Use a namespace or manifest id.`);
    process.exit(1);
  }

  const { manifest } = await readPluginManifest(pluginMatch.dir);
  const namespace = manifest.namespace || pluginMatch.namespace || manifest.id;
  const targetDir = await selectPluginMigrationDir(pluginMatch.dir);

  return {
    type: "plugin",
    id: manifest.id || namespace,
    namespace,
    label: `plugin ${manifest.id || namespace}`,
    pluginDir: pluginMatch.dir,
    migrationsDir: targetDir,
  };
}

async function selectPluginMigrationDir(pluginDir) {
  const preferred = resolve(pluginDir, "prisma", "migrations");
  if (await pathExists(preferred)) return preferred;
  const fallback = resolve(pluginDir, "migrations");
  return fallback;
}

function formatEnabledEntrySet(manifest) {
  return new Set(
    (manifest.enabledPlugins || [])
      .map((entry) => {
        if (typeof entry !== "string") return null;
        const idx = entry.lastIndexOf("@");
        return (idx === -1 ? entry : entry.slice(0, idx)).trim() || null;
      })
      .filter(Boolean)
  );
}

// -------- Serve helpers (pm2 + build orchestration) --------
async function which(cmd) {
  try {
    await execFileAsync(process.platform === "win32" ? "where" : "which", [cmd], { timeout: 5000 });
    return true;
  } catch {
    return false;
  }
}

async function pm2Cmd(args, opts = {}) {
  if (await which("pm2")) {
    return execFileAsync("pm2", args, { maxBuffer: 10 * 1024 * 1024, ...opts });
  }
  return execFileAsync("npx", ["pm2@latest", ...args], { maxBuffer: 10 * 1024 * 1024, ...opts });
}

async function yarnListScripts() {
  try {
    const { stdout } = await execFileAsync("yarn", ["-s", "run"]);
    return stdout
      ? stdout
          .split(/\r?\n/)
          .map((l) => l.trim())
          .filter(Boolean)
      : [];
  } catch {
    return [];
  }
}

async function yarnHasScript(name) {
  const lines = await yarnListScripts();
  return lines.some((l) => l === name);
}

async function runYarnScript(name, ...args) {
  if (!(await yarnHasScript(name))) {
    console.log(`[serve] (skip) no yarn script "${name}"`);
    return;
  }
  console.log(`[serve] running: yarn ${name}${args.length ? " " + args.join(" ") : ""}`);
  await execFileAsync("yarn", [name, ...args], { stdio: "inherit" });
}

async function pathIsDir(p) {
  try {
    const st = await fs.stat(p);
    return st.isDirectory();
  } catch {
    return false;
  }
}

async function firstRunNeededCLI() {
  const nm = await pathIsDir(resolve(process.cwd(), "node_modules"));
  const plat = await pathIsDir(resolve(process.cwd(), "platform"));
  const dist = await pathIsDir(resolve(process.cwd(), "platform", "dist"));
  const prepared = await pathExists(resolve(process.cwd(), ".state", "prepared"));
  return !nm || !plat || !dist || !prepared;
}

async function healthCheck({ port = 4000, path = "/readyz", tries = 30, intervalMs = 1000 } = {}) {
  const url = `http://127.0.0.1:${port}${path}`;
  for (let i = 0; i < tries; i++) {
    try {
      // eslint-disable-next-line n/no-unsupported-features/node-builtins
      const res = await fetch(url, { method: "GET" });
      if (res.ok) {
        console.log(`[serve] ✅ healthy at ${url}`);
        return true;
      }
    } catch {
      /* empty */
    }
    // eslint-disable-next-line promise/param-names
    await new Promise((r) => setTimeout(r, intervalMs));
  }
  console.warn(`[serve] ❌ health check failed at ${url}`);
  try {
    await pm2Cmd(["logs", "sovereign", "--lines", "200"]);
    // eslint-disable-next-line no-empty
  } catch {}
  return false;
}

async function startOrRestart({ ecosystem = "ecosystem.config.cjs" } = {}) {
  try {
    await pm2Cmd(["show", "sovereign"]);
    console.log("[serve] restarting sovereign");
    await pm2Cmd(["restart", "sovereign", "--update-env"]);
  } catch {
    console.log("[serve] starting sovereign");
    await pm2Cmd(["start", ecosystem, "--env", "production"]);
  }
  try {
    await pm2Cmd(["save"]);
    // eslint-disable-next-line no-empty
  } catch {}
}

async function fullBuildCLI() {
  // install on truly first run
  if (!(await pathIsDir(resolve(process.cwd(), "node_modules")))) {
    console.log("[serve] installing deps…");
    try {
      await execFileAsync("yarn", ["install", "--frozen-lockfile"], { stdio: "inherit" });
    } catch {
      await execFileAsync("yarn", ["install"], { stdio: "inherit" });
    }
  }
  await runYarnScript("prepare:env");
  await runYarnScript("prepare:all");
  await runYarnScript("build");
  await runYarnScript("build:manifest");
  await fs.mkdir(resolve(process.cwd(), ".state"), { recursive: true });
  await fs.writeFile(resolve(process.cwd(), ".state", "prepared"), `${new Date().toISOString()}\n`);
}

async function rebuildCLI() {
  await runYarnScript("build:manifest");
  await runYarnScript("build");
}

// Command Tree
const commands = {
  serve: {
    __help__: `
      Usage:
        sv serve [--force] [--no-health] [--port <n>] [--ecosystem <path>]
        sv serve rebuild [--no-health] [--port <n>] [--ecosystem <path>]
        sv serve delete

      Notes:
        - "serve" without subcommand runs first-run detection:
          full build on first run (install → prepare:env → prepare:all → build → build:manifest),
          else fast restart.
        - Uses PM2 if present, else falls back to "npx pm2@latest".
    `,
    async run(args) {
      const sub = args._[1] || "";
      const flags = args.flags || {};
      const port = Number.parseInt(flags.port, 10) || 4000;
      // eslint-disable-next-line no-extra-boolean-cast
      const doHealth = !Boolean(flags["no-health"]);
      const ecosystem = flags.ecosystem || "ecosystem.config.cjs";
      if (sub === "delete") {
        try {
          await pm2Cmd(["delete", "sovereign"]);
          console.log("[serve] PM2 process removed.");
        } catch {
          console.log("[serve] PM2 process not found.");
        }
        return;
      }
      if (sub === "rebuild") {
        await rebuildCLI();
        await startOrRestart({ ecosystem });
        if (doHealth) await healthCheck({ port });
        return;
      }
      // default: auto
      const force = Boolean(flags.force);
      if (force || (await firstRunNeededCLI())) {
        console.log("[serve] ===== First run (or --force) → full build =====");
        await fullBuildCLI();
      } else {
        console.log("[serve] ===== Not first run → fast restart =====");
      }
      await startOrRestart({ ecosystem });
      if (doHealth) await healthCheck({ port });
    },
  },
  // Global meta (no run; handled separately)
  meta: {
    name: "sv",
    version: pkg.cliVersion || pkg.version || "0.0.0",
    globals: [
      "--help",
      "--version",
      "--verbose",
      "--quiet",
      "--json",
      "--no-color",
      "--dry-run",
      "--config",
      "--cwd",
    ],
  },

  invites: {
    __help__: `
      Usage:
        sv invites create --role <key> [--tenant TID] [--project PID] [--max-uses N] [--mode single|unlimited] [--expires <date>] [--email <addr>] [--domain <domain>]
        sv invites list [--json] [--tenant TID] [--project PID] [--active|--expired|--revoked]
        sv invites revoke <inviteId>
    `,

    create: {
      desc: "Create a new invite code",
      async run(args) {
        const roleKey = args.flags.role || args.flags.r;
        if (!roleKey) {
          exitUsage(`Missing --role. Usage: sv invites create --role <key> [options]`);
        }

        const tenantId = args.flags.tenant || args.flags.t || null;
        const projectId = args.flags.project || null;
        const mode = args.flags.mode;
        const maxUses = parseInviteMaxUses(args.flags["max-uses"] ?? args.flags.maxUses, mode);
        const expiresAt = parseInviteExpiry(args.flags.expires || args.flags.expiry);
        const allowedEmail = args.flags.email || args.flags["allowed-email"] || null;
        const allowedDomain = args.flags.domain || args.flags["allowed-domain"] || null;
        const createdByUserId = args.flags["created-by"] || "cli";
        const outputJson = Boolean(args.flags.json);

        let exitCode = 0;
        try {
          const { invite, code } = await createInviteRecord({
            createdByUserId,
            roleKey: String(roleKey).trim(),
            tenantId,
            projectId,
            maxUses,
            expiresAt,
            allowedEmail,
            allowedDomain,
          });
          const view = serializeInvite(invite);

          if (outputJson) {
            console.log(JSON.stringify({ code, invite: view }, null, 2));
            return;
          }

          console.log("Invite created");
          console.log(`  id: ${invite.id}`);
          console.log(`  code: ${code}`);
          console.log(`  preview: ${invite.codePreview || code.slice(0, 10)}`);
          console.log(
            `  scope: tenant=${view.tenantId || "none"} project=${view.projectId || "none"}`
          );
          console.log(
            `  uses: ${view.usedCount}/${view.maxUses === null || view.maxUses === undefined ? "unlimited" : view.maxUses}`
          );
          if (view.expiresAt) {
            console.log(`  expires: ${new Date(view.expiresAt).toISOString()}`);
          }
          if (allowedEmail) console.log(`  allowedEmail: ${allowedEmail}`);
          if (allowedDomain) console.log(`  allowedDomain: ${allowedDomain}`);
        } catch (err) {
          console.error(`Failed to create invite: ${err?.message || err}`);
          exitCode = 1;
        } finally {
          await prisma.$disconnect().catch(() => {});
          if (exitCode) process.exit(exitCode);
        }
      },
    },

    list: {
      desc: "List invites",
      async run(args) {
        const tenantId = args.flags.tenant || args.flags.t || null;
        const projectId = args.flags.project || null;
        const outputJson = Boolean(args.flags.json);
        const statusFlag = args.flags.active
          ? "active"
          : args.flags.expired
            ? "expired"
            : args.flags.revoked
              ? "revoked"
              : args.flags.status
                ? String(args.flags.status).toLowerCase()
                : "";

        let exitCode = 0;
        try {
          const where = {};
          if (tenantId) where.tenantId = tenantId;
          if (projectId) where.projectId = projectId;
          const rows = await prisma.invite.findMany({
            where,
            orderBy: { createdAt: "desc" },
          });

          const invites = rows
            .map((row) => {
              const status = deriveInviteStatus(row).status;
              return { ...serializeInvite(row), status };
            })
            .filter((item) => {
              if (!statusFlag) return true;
              return item.status === statusFlag;
            });

          if (outputJson) {
            console.log(JSON.stringify(invites, null, 2));
            return;
          }

          if (!invites.length) {
            console.log("No invites found.");
            return;
          }

          const columns = [
            { key: "id", label: "ID", format: (row) => row.id },
            { key: "preview", label: "Preview", format: (row) => row.codePreview || "" },
            { key: "roleKey", label: "Role", format: (row) => row.roleKey },
            {
              key: "scope",
              label: "Scope",
              format: (row) => `${row.tenantId || "-"} / ${row.projectId || "-"}`,
            },
            {
              key: "uses",
              label: "Uses",
              format: (row) =>
                `${row.usedCount}/${row.maxUses === null || row.maxUses === undefined ? "∞" : row.maxUses}`,
            },
            { key: "status", label: "Status", format: (row) => row.status || "" },
            {
              key: "expires",
              label: "Expires",
              format: (row) =>
                row.expiresAt ? new Date(row.expiresAt).toISOString().slice(0, 10) : "-",
            },
          ];

          const widths = columns.map((col) =>
            invites.reduce((max, row) => {
              const value = col.format(row) || "";
              return Math.max(max, String(value).length, col.label.length);
            }, col.label.length)
          );

          const header = columns.map((col, idx) => col.label.padEnd(widths[idx])).join("  ");
          console.log(header);
          console.log(columns.map((_, idx) => "-".repeat(widths[idx])).join("  "));

          for (const row of invites) {
            const line = columns
              .map((col, idx) => String(col.format(row) || "").padEnd(widths[idx]))
              .join("  ");
            console.log(line);
          }
        } catch (err) {
          console.error(`Failed to list invites: ${err?.message || err}`);
          exitCode = 1;
        } finally {
          await prisma.$disconnect().catch(() => {});
          if (exitCode) process.exit(exitCode);
        }
      },
    },

    revoke: {
      desc: "Revoke an invite",
      async run(args) {
        const id = args._[2];
        if (!id) {
          exitUsage(`Missing invite id. Usage: sv invites revoke <inviteId>`);
        }

        let exitCode = 0;
        try {
          await prisma.invite.update({
            where: { id },
            data: { revokedAt: new Date() },
          });
          console.log(`Invite ${id} revoked.`);
        } catch (err) {
          if (err?.code === "P2025") {
            console.error(`Invite ${id} not found.`);
          } else {
            console.error(`Failed to revoke invite: ${err?.message || err}`);
          }
          exitCode = 1;
        } finally {
          await prisma.$disconnect().catch(() => {});
          if (exitCode) process.exit(exitCode);
        }
      },
    },
  },

  plugins: {
    __help__: `
      Usage:
        sv plugins create <namespace> [--framework js|react] [options]
        sv plugins add <spec>
        sv plugins list [--json] [--enabled|--disabled]
        sv plugins enable <namespace>
        sv plugins disable <namespace>
        sv plugins remove <namespace>
        sv plugins show <namespace> [--json]
        sv plugins validate <path>

      Examples:
        sv plugins add ./src/plugins/blog
        sv plugins enable @sovereign/blog
        sv plugins list --json
    `,

    create: {
      desc: "Scaffold a new plugin from the built-in templates",
      async run(args) {
        const namespace = args._[2];
        if (!namespace) {
          exitUsage(`Missing plugin namespace. Usage: sv plugins create <namespace> [options]`);
        }
        assertValidNamespace(namespace);

        const dryRun = Boolean(args.flags["dry-run"]);
        const skipManifest = Boolean(args.flags["skip-manifest"]);
        const outputJson = Boolean(args.flags.json);
        const frameworkInput = args.flags.framework || "js";
        const framework = String(frameworkInput).toLowerCase();
        if (!SUPPORTED_PLUGIN_FRAMEWORKS.includes(framework)) {
          exitUsage(
            `Unknown plugin framework "${framework}". Expected one of ${SUPPORTED_PLUGIN_FRAMEWORKS.join(", ")}.`
          );
        }
        const pluginTypeInput = args.flags.type || args.flags["plugin-type"] || "module";
        const pluginType = SUPPORTED_PLUGIN_TYPES.includes(String(pluginTypeInput).toLowerCase())
          ? String(pluginTypeInput).toLowerCase()
          : "module";
        const version = args.flags.version || "0.1.0";
        const displayName =
          args.flags.name || args.flags["display-name"] || toTitleCase(namespace) || namespace;
        const description =
          args.flags.description ||
          `Kickstart the ${displayName} ${framework} plugin for Sovereign.`;
        const author =
          args.flags.author || pkg?.contributors?.[0]?.name || "Sovereign Plugin Author";
        const license = args.flags.license || "AGPL-3.0";
        const pluginId =
          args.flags.id || args.flags["plugin-id"] || deriveDefaultPluginId(namespace);
        const devPortFlag = args.flags["dev-port"] || args.flags.port || null;
        const fallbackPort = 4100 + Math.floor(Math.random() * 200);
        const devPort = Number.parseInt(devPortFlag, 10);
        const resolvedDevPort = Number.isFinite(devPort) ? devPort : fallbackPort;
        const previewPort = resolvedDevPort + 4000;
        const devOrigin = `http://localhost:${resolvedDevPort}`;
        const libraryGlobal = formatLibraryGlobal(displayName, namespace);
        const targetDir = resolve(PLUGINS_DIR, namespace);

        const installed = await indexInstalledPlugins();
        if (installed.byNamespace.has(namespace)) {
          throw new Error(
            `Plugin namespace "${namespace}" already exists at ${installed.byNamespace.get(namespace).dir}.`
          );
        }
        if (pluginId && installed.byId.has(pluginId)) {
          throw new Error(
            `Plugin id "${pluginId}" already exists at ${installed.byId.get(pluginId).dir}.`
          );
        }
        if (!dryRun && (await pathExists(targetDir))) {
          throw new Error(`Target directory ${targetDir} already exists.`);
        }

        const replacements = {
          PLUGIN_ID: pluginId,
          NAMESPACE: namespace,
          DISPLAY_NAME: displayName,
          DESCRIPTION: description,
          VERSION: version,
          AUTHOR: author,
          LICENSE: license,
          DEV_PORT: String(resolvedDevPort),
          DEV_ORIGIN: devOrigin,
          PREVIEW_PORT: String(previewPort),
          LIB_GLOBAL: libraryGlobal,
          PLUGIN_TYPE: pluginType,
        };

        let templateDir;
        if (dryRun) {
          templateDir = await resolvePluginTemplateDir(framework);
        } else {
          await fs.mkdir(PLUGINS_DIR, { recursive: true });
          templateDir = await copyPluginTemplate(framework, targetDir, replacements);
          if (!skipManifest) {
            await runPluginsUpdateTool();
          }
        }

        const result = {
          action: dryRun ? "plan" : "create",
          namespace,
          id: pluginId,
          framework,
          type: pluginType,
          targetDir,
          templateDir,
          dryRun,
        };

        if (outputJson) {
          console.log(JSON.stringify(result, null, 2));
        } else if (dryRun) {
          console.log(
            `Would scaffold ${framework} plugin "${pluginId}" at ${targetDir} from template ${templateDir}.`
          );
        } else {
          console.log(
            `Created ${framework} plugin "${pluginId}" in ${targetDir} from template ${templateDir}.`
          );
          if (!skipManifest) {
            console.log(`Plugins synced via tools/plugins-update.mjs.`);
          } else {
            console.log(`--skip-manifest set; run "sv manifest generate" when ready.`);
          }
        }
      },
    },

    add: {
      desc: "Register/install a plugin from a git URL or local directory",
      async run(args) {
        const spec = args._[2];
        if (!spec) {
          exitUsage(`Missing plugin spec. Usage: sv plugins add <git-url|path>`);
        }

        const dryRun = Boolean(args.flags["dry-run"]);
        const outputJson = Boolean(args.flags.json);
        const checksumFlag = args.flags.checksum;
        const expectedChecksum = typeof checksumFlag === "string" ? checksumFlag.trim() : null;

        const specContext = await resolvePluginSpec(spec);
        const cleanup = specContext.cleanup;

        try {
          const { manifest } = await readPluginManifest(specContext.sourcePath);
          const namespace = deriveNamespace(manifest, specContext.sourcePath);
          assertValidNamespace(namespace);

          const targetDir = resolve(PLUGINS_DIR, namespace);
          const normalizedSource = resolve(specContext.sourcePath);
          const normalizedTarget = resolve(targetDir);
          if (normalizedSource === normalizedTarget) {
            throw new Error(
              `Source directory "${specContext.sourcePath}" is already installed at ${targetDir}.`
            );
          }

          const installed = await indexInstalledPlugins();
          if (installed.byId.has(manifest.id)) {
            const conflict = installed.byId.get(manifest.id);
            throw new Error(
              `Plugin id "${manifest.id}" already exists under ${conflict?.dir || "(unknown)"}.`
            );
          }
          if (installed.byNamespace.has(namespace)) {
            const conflict = installed.byNamespace.get(namespace);
            throw new Error(
              `Plugin namespace "${namespace}" already exists under ${conflict?.dir || "(unknown)"}.`
            );
          }
          if (await pathExists(targetDir)) {
            throw new Error(`Target directory ${targetDir} already exists.`);
          }

          let computedChecksum = null;
          if (expectedChecksum) {
            computedChecksum = await hashDirectory(specContext.sourcePath);
            if (computedChecksum !== expectedChecksum) {
              throw new Error(
                `Checksum mismatch. Expected ${expectedChecksum} but got ${computedChecksum}.`
              );
            }
          }

          await fs.mkdir(PLUGINS_DIR, { recursive: true });

          if (!dryRun) {
            await copyPluginSource(specContext.sourcePath, targetDir);
            await runPluginsUpdateTool();
          }

          const result = {
            action: dryRun ? "plan" : "install",
            id: manifest.id,
            namespace,
            version: manifest.version,
            targetDir,
            source: specContext.provenance,
            checksum: computedChecksum,
            dryRun,
          };

          if (outputJson) {
            console.log(JSON.stringify(result, null, 2));
          } else {
            const verb = dryRun ? "Would install" : "Installed";
            console.log(
              `${verb} ${manifest.id} (${manifest.version}) to ${targetDir} from ${specContext.provenance}.`
            );
            if (computedChecksum) {
              console.log(`Checksum verified: ${computedChecksum}`);
            }
            if (!dryRun) {
              console.log(`Plugins synced via tools/plugins-update.mjs.`);
            } else {
              console.log(`--dry-run enabled; no files were changed.`);
            }
          }
        } finally {
          if (typeof cleanup === "function") {
            await cleanup();
          }
        }
      },
    },

    list: {
      desc: "List plugins",
      async run(args) {
        const outputJson = Boolean(args.flags.json);
        const filterEnabled = Boolean(args.flags.enabled);
        const filterDisabled = Boolean(args.flags.disabled);

        if (filterEnabled && filterDisabled) {
          exitUsage(`Cannot combine --enabled and --disabled.`);
        }

        const manifest = await readManifestFile();
        const pluginRegistry = manifest.plugins || {};
        const enabledEntries = new Set(
          (manifest.enabledPlugins || [])
            .map((entry) => {
              if (typeof entry !== "string") return null;
              const idx = entry.lastIndexOf("@");
              return (idx === -1 ? entry : entry.slice(0, idx)).trim() || null;
            })
            .filter(Boolean)
        );

        const rows = Object.entries(pluginRegistry).map(([namespace, plugin]) => {
          const ns = namespace || plugin?.namespace || plugin?.id || "";
          return {
            namespace: ns,
            id: plugin?.id || ns,
            version: plugin?.version || "(unknown)",
            framework: plugin?.framework || "(unknown)",
            type: plugin?.type || "(unknown)",
            enabled: enabledEntries.has(ns),
          };
        });

        rows.sort((a, b) => a.namespace.localeCompare(b.namespace));

        let filtered = rows;
        if (filterEnabled) {
          filtered = rows.filter((row) => row.enabled);
        } else if (filterDisabled) {
          filtered = rows.filter((row) => !row.enabled);
        }

        if (outputJson) {
          console.log(JSON.stringify(filtered, null, 2));
          return;
        }

        if (!filtered.length) {
          console.log("No plugins found.");
          return;
        }

        const columns = [
          { key: "namespace", label: "Namespace" },
          { key: "id", label: "ID" },
          { key: "version", label: "Version" },
          { key: "framework", label: "Framework" },
          { key: "type", label: "Type" },
          { key: "enabled", label: "Enabled" },
        ];

        const widths = columns.map((col) => {
          return filtered.reduce((max, row) => {
            const value = col.key === "enabled" ? (row.enabled ? "yes" : "no") : row[col.key] || "";
            return Math.max(max, String(value).length);
          }, col.label.length);
        });

        const header = columns.map((col, idx) => col.label.padEnd(widths[idx])).join("  ");
        console.log(header);
        console.log(columns.map((_, idx) => "-".repeat(widths[idx])).join("  "));

        for (const row of filtered) {
          const line = columns
            .map((col, idx) => {
              let value;
              if (col.key === "enabled") {
                value = row.enabled ? "yes" : "no";
              } else {
                value = row[col.key] || "";
              }
              return String(value).padEnd(widths[idx]);
            })
            .join("  ");
          console.log(line);
        }
      },
    },

    enable: {
      desc: "Enable a plugin by namespace",
      async run(args) {
        const namespace = args._[2];
        if (!namespace) {
          exitUsage(`Missing plugin namespace. Usage: sv plugins enable <namespace>`);
        }

        const dryRun = Boolean(args.flags["dry-run"]);
        const installed = await indexInstalledPlugins();
        const match = installed.byNamespace.get(namespace);
        if (!match) {
          console.error(`Plugin namespace "${namespace}" is not installed under ${PLUGINS_DIR}.`);
          process.exit(1);
        }

        const { manifest, manifestPath } = await readPluginManifest(match.dir);
        const updates = {};
        if (manifest.enabled !== true) updates.enabled = true;
        if (manifest.devOnly !== false) updates.devOnly = false;

        if (!Object.keys(updates).length) {
          console.log(`${manifest.id || namespace} is already enabled.`);
          return;
        }

        const nextManifest = { ...manifest, ...updates };
        if (dryRun) {
          console.log(
            `[dry-run] Would update ${manifestPath} (${Object.keys(updates).join(", ")})`
          );
          console.log("[dry-run] Would rebuild manifest via tools/build-manifest.mjs.");
          return;
        }

        await fs.writeFile(manifestPath, `${JSON.stringify(nextManifest, null, 2)}\n`);
        console.log(
          `Updated ${manifestPath}: enabled=true, devOnly=false for ${manifest.id || namespace}.`
        );
        await runManifestBuild();
        console.log(`Manifest rebuilt via tools/build-manifest.mjs.`);
      },
    },

    disable: {
      desc: "Disable a plugin by namespace",
      async run(args) {
        const namespace = args._[2];
        if (!namespace) {
          exitUsage(`Missing plugin namespace. Usage: sv plugins disable <namespace>`);
        }

        const dryRun = Boolean(args.flags["dry-run"]);
        const installed = await indexInstalledPlugins();
        const match = installed.byNamespace.get(namespace);
        if (!match) {
          console.error(`Plugin namespace "${namespace}" is not installed under ${PLUGINS_DIR}.`);
          process.exit(1);
        }

        const { manifest, manifestPath } = await readPluginManifest(match.dir);
        const updates = {};
        if (manifest.enabled !== false) updates.enabled = false;
        if (manifest.devOnly !== true) updates.devOnly = true;

        if (!Object.keys(updates).length) {
          console.log(`${manifest.id || namespace} is already disabled.`);
          return;
        }

        const nextManifest = { ...manifest, ...updates };
        if (dryRun) {
          console.log(
            `[dry-run] Would update ${manifestPath} (${Object.keys(updates).join(", ")})`
          );
          console.log("[dry-run] Would rebuild manifest via tools/build-manifest.mjs.");
          return;
        }

        await fs.writeFile(manifestPath, `${JSON.stringify(nextManifest, null, 2)}\n`);
        console.log(
          `Updated ${manifestPath}: enabled=false, devOnly=true for ${manifest.id || namespace}.`
        );
        await runManifestBuild();
        console.log(`Manifest rebuilt via tools/build-manifest.mjs.`);
      },
    },

    remove: {
      desc: "Unregister/remove a plugin",
      async run(args) {
        const namespace = args._[2];
        if (!namespace) {
          exitUsage(`Missing plugin namespace. Usage: sv plugins remove <namespace>`);
        }

        const dryRun = Boolean(args.flags["dry-run"]);
        const keepFiles = Boolean(args.flags["keep-files"]);
        const toolArgs = [namespace];
        if (keepFiles) toolArgs.push("--keep-files");
        if (dryRun) toolArgs.push("--dry-run");
        await runPluginsRemoveTool(toolArgs);
      },
    },

    show: {
      desc: "Show plugin details",
      async run(args) {
        const namespace = args._[2];
        if (!namespace) {
          exitUsage(`Missing plugin namespace. Usage: sv plugins show <namespace> [--json]`);
        }

        const outputJson = Boolean(args.flags.json);
        const installed = await indexInstalledPlugins();
        const match = installed.byNamespace.get(namespace) || installed.byId.get(namespace) || null;

        if (!match) {
          console.error(`Plugin "${namespace}" is not installed under ${PLUGINS_DIR}.`);
          process.exit(1);
        }

        const { manifest, manifestPath } = await readPluginManifest(match.dir);
        const workspaceManifest = await readManifestFile();
        const enabledSet = formatEnabledEntrySet(workspaceManifest);
        const effectiveNamespace = manifest.namespace || namespace;
        const enabled = enabledSet.has(effectiveNamespace);
        const registryEntry =
          workspaceManifest.plugins?.[effectiveNamespace] ||
          workspaceManifest.plugins?.[namespace] ||
          null;

        const detail = {
          namespace: effectiveNamespace,
          id: manifest.id,
          name: manifest.name,
          version: manifest.version,
          framework: manifest.framework,
          type: manifest.type,
          enabled,
          manifestEnabled: manifest.enabled !== false,
          devOnly: manifest.devOnly ?? null,
          directory: match.dir,
          manifestPath,
          registered: Boolean(registryEntry),
          description: manifest.description || "",
          entryPoints: manifest.entryPoints || {},
        };

        if (outputJson) {
          console.log(JSON.stringify({ ...detail, manifest }, null, 2));
          return;
        }

        console.log(`Namespace: ${detail.namespace}`);
        console.log(`ID: ${detail.id}`);
        console.log(`Name: ${detail.name}`);
        console.log(`Version: ${detail.version}`);
        console.log(`Framework: ${detail.framework}`);
        console.log(`Type: ${detail.type}`);
        console.log(`Enabled (workspace): ${detail.enabled ? "yes" : "no"}`);
        console.log(
          `Manifest enabled=${detail.manifestEnabled ? "true" : "false"}, devOnly=${detail.devOnly}`
        );
        console.log(`Directory: ${detail.directory}`);
        console.log(`Manifest: ${detail.manifestPath}`);
        console.log(`Registered in manifest.json: ${detail.registered ? "yes" : "no"}`);
        if (detail.description) {
          console.log(`Description: ${detail.description}`);
        }
        if (detail.entryPoints && Object.keys(detail.entryPoints).length) {
          console.log("Entry points:");
          for (const [key, value] of Object.entries(detail.entryPoints)) {
            console.log(`  - ${key}: ${value}`);
          }
        }
      },
    },

    validate: {
      desc: "Validate a plugin directory",
      async run(args) {
        const targetPath = args._[2];
        if (!targetPath) {
          exitUsage(`Missing plugin path. Usage: sv plugins validate <path> [--json]`);
        }

        const outputJson = Boolean(args.flags.json);
        const resolved = resolve(process.cwd(), targetPath);
        const diagnostics = [];
        let manifestInfo = null;

        try {
          const stats = await fs.stat(resolved);
          if (!stats.isDirectory()) {
            diagnostics.push(`Path ${resolved} is not a directory.`);
          }
        } catch (err) {
          diagnostics.push(`Path ${resolved} is not accessible: ${err?.message || err}`);
        }

        if (!diagnostics.length) {
          try {
            manifestInfo = await readPluginManifest(resolved);
          } catch (err) {
            diagnostics.push(err?.message || String(err));
          }
        }

        let manifest = manifestInfo?.manifest;
        if (manifest) {
          const required = [];
          if (manifest.framework === "js") {
            required.push("index.js");
          }
          if (manifest.framework === "react") {
            required.push("dist/index.js");
          }
          for (const rel of required) {
            const fullPath = resolve(resolved, rel);

            const exists = await pathExists(fullPath);
            if (!exists) {
              diagnostics.push(`Missing required file for ${manifest.framework} plugin: ${rel}`);
            }
          }
        }

        const result = {
          status: diagnostics.length ? "error" : "ok",
          path: resolved,
          manifest: manifest || null,
          issues: diagnostics,
        };

        if (outputJson) {
          console.log(JSON.stringify(result, null, 2));
        } else if (diagnostics.length) {
          diagnostics.forEach((msg) => console.error(`✗ ${msg}`));
        } else if (manifest) {
          console.log(`✓ ${manifest.id || manifest.namespace || resolved} passed validation.`);
        } else {
          console.log(`✓ ${resolved} passed validation.`);
        }

        if (diagnostics.length) {
          process.exit(1);
        }
      },
    },
  },

  migrate: {
    __help__: `
      Usage:
        sv migrate deploy [--plugin <id>] [--dry-run]
        sv migrate status [--plugin <id>] [--json]
        sv migrate generate [--plugin <id>]

      Notes:
        --plugin <id> limits operation to a plugin; omit for core.
    `,

    deploy: {
      desc: "Run migrations (core or plugin-scoped)",
      async run(args) {
        const pluginSelector = args.flags.plugin;
        const dryRun = Boolean(args.flags["dry-run"]);
        const outputJson = Boolean(args.flags.json);

        const target = await resolveMigrationTarget(pluginSelector);
        const migrations = await collectMigrationDirs(target.migrationsDir);

        if (!migrations.length) {
          const msg = `No migrations found under ${target.migrationsDir} for ${target.label}.`;
          if (outputJson) {
            console.log(
              JSON.stringify({ target: target.label, pending: [], message: msg }, null, 2)
            );
          } else {
            console.log(msg);
          }
          return;
        }

        const state = await loadMigrationState();
        const appliedList = target.type === "core" ? state.core : state.plugins[target.id] || [];
        const appliedSet = new Set(appliedList);
        const pending = migrations.filter((entry) => !appliedSet.has(entry.name));
        const pendingNames = pending.map((entry) => entry.name);

        const summary = {
          target: target.label,
          pending: pendingNames,
          total: migrations.length,
          dryRun,
        };

        if (!pending.length) {
          if (outputJson) {
            console.log(JSON.stringify({ ...summary, message: "No pending migrations." }, null, 2));
          } else {
            console.log(`No pending migrations for ${target.label}.`);
          }
          return;
        }

        if (dryRun) {
          if (outputJson) {
            console.log(JSON.stringify(summary, null, 2));
          } else {
            console.log(`[dry-run] Would apply ${pendingNames.length} migration(s):`);
            pendingNames.forEach((name) => console.log(`  - ${name}`));
          }
          return;
        }

        for (const entry of pending) {
          console.log(`Applying ${entry.name} for ${target.label}...`);
          // Placeholder for actual migration execution.
          console.log(`✓ ${entry.name} applied.`);
        }

        if (target.type === "core") {
          state.core = Array.from(new Set([...appliedList, ...pendingNames]));
        } else {
          state.plugins[target.id] = Array.from(
            new Set([...(state.plugins[target.id] || []), ...pendingNames])
          );
        }

        await saveMigrationState(state);

        if (outputJson) {
          console.log(JSON.stringify(summary, null, 2));
        } else {
          console.log(`Applied ${pendingNames.length} migration(s) for ${target.label}.`);
        }
      },
    },

    status: {
      desc: "Show migration status",
      async run(args) {
        const pluginSelector = args.flags.plugin;
        const outputJson = Boolean(args.flags.json);
        const target = await resolveMigrationTarget(pluginSelector);

        const migrations = await collectMigrationDirs(target.migrationsDir);
        const state = await loadMigrationState();
        const appliedList = target.type === "core" ? state.core : state.plugins[target.id] || [];
        const appliedSet = new Set(appliedList);
        const pending = migrations
          .filter((entry) => !appliedSet.has(entry.name))
          .map((entry) => entry.name);

        const payload = {
          target: target.label,
          total: migrations.length,
          applied: appliedList,
          pending,
        };

        if (outputJson) {
          console.log(JSON.stringify(payload, null, 2));
          return;
        }

        console.log(`Migration status for ${target.label}:`);
        console.log(`  Total migrations: ${payload.total}`);
        console.log(`  Applied: ${payload.applied.length}`);
        console.log(`  Pending: ${payload.pending.length}`);
        if (payload.pending.length) {
          payload.pending.forEach((name) => console.log(`    - ${name}`));
        }
      },
    },

    generate: {
      desc: "Generate a new migration (optional exposure)",
      async run(args) {
        if (process.env.CI) {
          console.error(`Refusing to generate migrations in CI.`);
          process.exit(1);
        }

        const slug = args._[2];
        if (!slug) {
          exitUsage(`Missing migration name. Usage: sv migrate generate <name> [--plugin <id>]`);
        }

        const pluginSelector = args.flags.plugin;
        const target = await resolveMigrationTarget(pluginSelector);
        const timestamp = new Date().toISOString().replace(/[-:T.Z]/g, "");
        const safeSlug =
          slug
            .trim()
            .toLowerCase()
            .replace(/[^a-z0-9]+/g, "_")
            .replace(/^_+|_+$/g, "") || "migration";
        const folderName = `${timestamp}_${safeSlug}`;
        const folderPath = resolve(target.migrationsDir, folderName);
        const migrationFile = resolve(folderPath, "migration.sql");

        await fs.mkdir(folderPath, { recursive: true });

        const header = `-- Migration: ${folderName}\n-- Target: ${target.label}\n`;
        await fs.writeFile(migrationFile, `${header}\n-- Add SQL statements here.\n`);

        console.log(`Created ${migrationFile} for ${target.label}.`);
      },
    },
  },

  manifest: {
    __help__: `
      Usage:
        sv manifest generate
        sv manifest show [--json]

      Notes:
        --json prints the raw manifest file.
    `,

    generate: {
      desc: "Build manifest.json via tools/build-manifest.mjs",
      async run() {
        await runManifestBuild();
      },
    },

    show: {
      desc: "Display the current manifest (JSON or summary)",
      async run(args) {
        const manifest = await readManifestFile();
        if (args.flags.json) {
          console.log(JSON.stringify(manifest, null, 2));
          return;
        }
        printManifestSummary(manifest);
      },
    },
  },
};

async function main() {
  const raw = process.argv.slice(2);
  const args = parseArgs(raw);

  if (args.flags.help || args.flags.h) {
    printUsage();
    return;
  }
  if (args.flags.version || args.flags.v) {
    // optionally read from package.json
    console.log(`sv ${pkg.cliVersion || pkg.version || "0.0.0"}`);
    return;
  }

  const ns = args._[0];
  const sub = args._[1];

  if (!ns) exitUsage();

  const nsNode = commands[ns];
  if (!nsNode) exitUsage(`Unknown namespace "${ns}".`);

  // Scoped help: `sv <ns> --help` or `sv <ns> <sub> --help`
  if (args.flags.help || args.flags.h) {
    if (sub && nsNode[sub] && typeof nsNode[sub].__help__ === "string") {
      console.log(nsNode[sub].__help__);
      return;
    }
    printNamespaceHelp(ns);
    return;
  }

  // If a subcommand is provided, dispatch to it
  if (sub) {
    const subHandler = nsNode[sub];
    if (!subHandler || typeof subHandler.run !== "function") {
      exitUsage(`Unknown command "${ns} ${sub}".`);
    }
    await subHandler.run(args);
    return;
  }

  // If no subcommand and the namespace itself is runnable, run it; otherwise show help
  if (typeof nsNode.run === "function") {
    await nsNode.run(args);
  } else {
    printNamespaceHelp(ns);
    process.exit(2);
  }
}

main().catch((err) => {
  console.error(err?.stack || err);
  process.exit(1);
});
