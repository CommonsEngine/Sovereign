import { promises as fs } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { execa } from "execa";

const args = process.argv.slice(2);
const command = args[0];
const pluginNamespace = args[1];

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, "..");
const pluginsDir = path.join(root, "plugins");

function printUsage() {
  console.log("Usage: node tools/plugin-db-manage.mjs <command> <plugin-namespace>");
  console.log("Commands:");
  console.log("  generate  - Generate Prisma client for the plugin");
  console.log("  migrate   - Run migrations (dev)");
  console.log("  deploy    - Deploy migrations (prod)");
  console.log("  studio    - Open Prisma Studio");
  process.exit(1);
}

if (!command || !pluginNamespace) {
  printUsage();
}

async function findPluginDir(namespace) {
  // Try direct match first (e.g. "blog" -> plugins/blog)
  let target = path.join(pluginsDir, namespace);
  try {
    const stat = await fs.stat(target);
    if (stat.isDirectory()) return target;
  } catch {}

  // Try searching for matching namespace in plugin.json
  const entries = await fs.readdir(pluginsDir, { withFileTypes: true });
  for (const entry of entries) {
    if (!entry.isDirectory()) continue;
    const pDir = path.join(pluginsDir, entry.name);
    try {
      const manifest = JSON.parse(await fs.readFile(path.join(pDir, "plugin.json"), "utf8"));
      if (manifest.namespace === namespace || manifest.id === namespace) {
        return pDir;
      }
    } catch {}
  }
  return null;
}

async function main() {
  const pluginDir = await findPluginDir(pluginNamespace);
  if (!pluginDir) {
    console.error(`Error: Plugin "${pluginNamespace}" not found.`);
    process.exit(1);
  }

  const schemaPath = path.join(pluginDir, "prisma/schema.prisma");
  try {
    await fs.access(schemaPath);
  } catch {
    console.error(`Error: No prisma/schema.prisma found in ${pluginDir}`);
    console.error("This tool is only for plugins with dedicated databases.");
    process.exit(1);
  }

  console.log(`[plugin-db] Managing database for ${pluginNamespace} in ${pluginDir}`);

  const prismaBin = path.join(root, "node_modules/.bin/prisma");
  const envFile = path.join(root, ".env");

  // Load env from root .env to ensure DATABASE_URL or other env vars are available if needed
  // But typically dedicated plugins should have their own env config or use a different var.
  // For now, we assume the user runs this with appropriate env vars set, or we load root .env.
  // We'll let prisma load .env from root if we run it from root.

  let prismaArgs = [];
  switch (command) {
    case "generate":
      prismaArgs = ["generate", "--schema", schemaPath];
      break;
    case "migrate":
      prismaArgs = ["migrate", "dev", "--schema", schemaPath];
      break;
    case "deploy":
      prismaArgs = ["migrate", "deploy", "--schema", schemaPath];
      break;
    case "studio":
      prismaArgs = ["studio", "--schema", schemaPath];
      break;
    default:
      printUsage();
  }

  console.log(`Running: prisma ${prismaArgs.join(" ")}`);

  try {
    await execa(prismaBin, prismaArgs, {
      cwd: root, // Run from root so it picks up root .env
      stdio: "inherit",
    });
  } catch (err) {
    console.error("Command failed.");
    process.exit(1);
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
