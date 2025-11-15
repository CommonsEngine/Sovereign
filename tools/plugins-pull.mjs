import { spawn } from "node:child_process";
import { mkdir, readFile, rm, stat } from "node:fs/promises";
import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const repoRoot = path.resolve(__dirname, "..");
const authRoot =
  process.env.SV_PLUGINS_AUTH_DIR || path.join(repoRoot, ".ssh", "sovereign-plugins");

async function loadNodeEnv() {
  const envPath = path.join(repoRoot, "platform/.env");
  let content;
  try {
    content = await readFile(envPath, "utf8");
  } catch (error) {
    console.warn(`Warning: unable to read ${path.relative(repoRoot, envPath)} (${error.message}).`);
    return;
  }

  for (const rawLine of content.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line || line.startsWith("#")) continue;
    const separatorIndex = line.indexOf("=");
    if (separatorIndex === -1) continue;

    const key = line.slice(0, separatorIndex).trim();
    if (!key) continue;
    let value = line.slice(separatorIndex + 1).trim();

    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }

    if (key === "NODE_ENV") {
      process.env.NODE_ENV = value;
      break;
    }
  }
}

async function directoryExists(dirPath) {
  try {
    const stats = await stat(dirPath);
    return stats.isDirectory();
  } catch {
    return false;
  }
}

function pluginDirectory(pluginName) {
  const namespace = pluginName.split("/").filter(Boolean).pop() ?? pluginName;
  return path.join(repoRoot, "plugins", namespace);
}

function sshToHttps(url) {
  if (url.startsWith("git@")) {
    const [, remainder] = url.split("@");
    const [host, repoPath] = remainder.split(":");
    if (host && repoPath) {
      return `https://${host}/${repoPath}`;
    }
  }

  if (url.startsWith("ssh://")) {
    try {
      const parsed = new URL(url);
      return `https://${parsed.host}${parsed.pathname}`;
    } catch {
      return null;
    }
  }

  return null;
}

async function pathExists(targetPath) {
  try {
    await stat(targetPath);
    return true;
  } catch {
    return false;
  }
}

function sanitizeNamespace(pluginName) {
  return pluginName.replace(/[^a-zA-Z0-9_.-]/g, "_");
}

async function loadPluginCredential(pluginName) {
  const keyBase = path.join(authRoot, sanitizeNamespace(pluginName));
  const sshKeyPath = `${keyBase}.key`;
  const patPath = `${keyBase}.pat`;

  const [hasSsh, hasPat] = await Promise.all([pathExists(sshKeyPath), pathExists(patPath)]);
  let pat = null;
  if (hasPat) {
    try {
      pat = (await readFile(patPath, "utf8")).trim();
    } catch {
      pat = null;
    }
  }

  return {
    sshKeyPath: hasSsh ? sshKeyPath : null,
    pat: pat || null,
  };
}

function buildCloneConfig(url, cred) {
  const env = {};
  let cloneUrl = url;

  if (cred?.sshKeyPath && (url.startsWith("git@") || url.startsWith("ssh://"))) {
    env.GIT_SSH_COMMAND = `ssh -i ${cred.sshKeyPath} -o IdentitiesOnly=yes -F /dev/null`;
  } else if (cred?.pat && url.startsWith("http")) {
    try {
      const parsed = new URL(url);
      parsed.username = parsed.username || "x-access-token";
      parsed.password = cred.pat;
      cloneUrl = parsed.toString();
    } catch {
      /* fall through without token injection */
    }
  }

  return { url: cloneUrl, env };
}

function gitClone(repoUrl, destination, env = {}) {
  return new Promise((resolve, reject) => {
    const child = spawn("git", ["clone", repoUrl, destination], {
      cwd: repoRoot,
      stdio: "inherit",
      env: { ...process.env, ...env },
    });

    child.on("error", reject);
    child.on("exit", (code) => {
      if (code === 0) {
        resolve();
      } else {
        reject(new Error(`git clone exited with code ${code}`));
      }
    });
  });
}

async function clonePlugin(name, repoUrl) {
  const destination = pluginDirectory(name);
  if (await directoryExists(destination)) {
    console.log(`Skipping ${name}: ${path.relative(repoRoot, destination)} already exists.`);
    return true;
  }

  await mkdir(path.dirname(destination), { recursive: true });
  const attempts = [repoUrl];
  const httpsCandidate = sshToHttps(repoUrl);
  if (httpsCandidate && httpsCandidate !== repoUrl) {
    attempts.push(httpsCandidate);
  }

  const credentials = await loadPluginCredential(name);

  for (const [index, url] of attempts.entries()) {
    try {
      const { url: cloneUrl, env } = buildCloneConfig(url, credentials);
      console.log(`Cloning ${name} from ${url}...`);
      await gitClone(cloneUrl, destination, env);
      return true;
    } catch (error) {
      const isLastAttempt = index === attempts.length - 1;
      if (isLastAttempt) {
        console.error(`Failed to clone ${name} from ${url}: ${error.message}`);
        return false;
      }

      console.warn(
        `Clone attempt ${index + 1} for ${name} failed (${error.message}). Retrying with fallback...`
      );
      await rm(destination, { recursive: true, force: true });
    }
  }

  return false;
}

async function main() {
  await loadNodeEnv();

  const pkgPath = path.join(repoRoot, "package.json");
  const pkgJson = JSON.parse(await readFile(pkgPath, "utf8"));
  const plugins = Object.entries(pkgJson.plugins ?? {});

  if (plugins.length === 0) {
    console.log("No plugins defined in package.json.");
    return;
  }

  let hasFailures = false;
  for (const [name, repoUrl] of plugins) {
    const success = await clonePlugin(name, repoUrl);
    hasFailures ||= !success;
  }

  if (hasFailures) {
    process.exitCode = 1;
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
