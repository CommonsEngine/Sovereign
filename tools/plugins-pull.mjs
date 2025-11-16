import { spawn } from "node:child_process";
import { mkdir, readFile, readdir, rm, stat } from "node:fs/promises";
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
  const sanitized = sanitizeNamespace(pluginName);
  const keyBase = path.join(authRoot, sanitized);
  const sshKeyPath = `${keyBase}.key`;
  const patPath = `${keyBase}.pat`;

  let sshKey = (await pathExists(sshKeyPath)) ? sshKeyPath : null;
  let pat = null;

  if (await pathExists(patPath)) {
    try {
      pat = (await readFile(patPath, "utf8")).trim();
    } catch {
      pat = null;
    }
  }

  // Fallback: scan local .ssh for any usable key/PAT when plugin-specific creds are absent
  if (!sshKey || !pat) {
    const localSshDir = path.join(repoRoot, ".ssh");
    try {
      const files = await readdir(localSshDir);
      if (!sshKey) {
        const keyFile = files.find(
          (f) => !f.endsWith(".pub") && (f.endsWith(".key") || f.startsWith("id_"))
        );
        if (keyFile) {
          sshKey = path.join(localSshDir, keyFile);
        }
      }
      if (!pat) {
        const patFile = files.find((f) => f.endsWith(".pat"));
        if (patFile) {
          try {
            pat = (await readFile(path.join(localSshDir, patFile), "utf8")).trim();
          } catch {
            pat = null;
          }
        }
      }
    } catch {
      // ignore if .ssh not present
    }
  }

  return {
    sshKeyPath: sshKey || null,
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
  const httpsCandidate = sshToHttps(repoUrl);
  const credentials = await loadPluginCredential(name);

  const attempts = [
    { url: repoUrl, cred: null, label: "ssh (direct)" }, // 1) original url, no creds
    httpsCandidate ? { url: httpsCandidate, cred: null, label: "https (public)" } : null, // 2) https public
    { url: repoUrl, cred: credentials, label: "ssh (with credentials)" }, // 3) ssh with keys/PAT
    httpsCandidate
      ? { url: httpsCandidate, cred: credentials, label: "https (with credentials)" }
      : null,
  ].filter(Boolean);

  for (const [index, attempt] of attempts.entries()) {
    const { url, cred, label } = attempt;
    try {
      const { url: cloneUrl, env } = buildCloneConfig(url, cred);
      console.log(`Cloning ${name} via ${label} from ${url}...`);
      await gitClone(cloneUrl, destination, env);
      return true;
    } catch (error) {
      const isLastAttempt = index === attempts.length - 1;
      const nextMsg = isLastAttempt ? "No fallbacks left." : "Retrying with fallback...";
      console.warn(`Clone attempt ${index + 1} for ${name} failed (${error.message}). ${nextMsg}`);
      await rm(destination, { recursive: true, force: true });
      if (isLastAttempt) {
        console.error(`Failed to clone ${name}: ${error.message}`);
        return false;
      }
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
