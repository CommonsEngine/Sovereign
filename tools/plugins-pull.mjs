import { spawn } from "node:child_process";
import { mkdir, readFile, rm, stat } from "node:fs/promises";
import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const repoRoot = path.resolve(__dirname, "..");

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

function gitClone(repoUrl, destination) {
  return new Promise((resolve, reject) => {
    const child = spawn("git", ["clone", repoUrl, destination], {
      cwd: repoRoot,
      stdio: "inherit",
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

  for (const [index, url] of attempts.entries()) {
    try {
      console.log(`Cloning ${name} from ${url}...`);
      await gitClone(url, destination);
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
