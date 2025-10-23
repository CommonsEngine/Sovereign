#!/usr/bin/env node
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";
import process from "node:process";

// robust side-effect import relative to this file
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
await import(resolve(__dirname, "../scripts/register-alias.mjs"));

// tiny args parser
function parseArgs(argv) {
  const out = { _: [], flags: {} };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a.startsWith("--")) {
      const [k, v] = a.slice(2).split("=");
      if (v !== undefined) out.flags[k] = v;
      else if (i + 1 < argv.length && !argv[i + 1].startsWith("-"))
        out.flags[k] = argv[++i];
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
  console.log(`Usage:
  sv [--help] [--version] <command> [options]

Commands:
  plugins:register <spec>          Register a plugin (path | git URL | npm name)
  plugins:list [--json]            List plugins
  plugins:enable <id>              Enable a plugin
  plugins:disable <id>             Disable a plugin
  migrate:deploy [--plugin <id>]   Run prisma migrate deploy (core or plugin)
`);
}

function exitUsage(msg) {
  if (msg) console.error(msg);
  printUsage();
  process.exit(2);
}

// Handlers
const commands = {
  "plugins:register": {
    desc: "Register a plugin",
    async run(args) {
      const spec = args._[1];
      if (!spec) exitUsage("Missing <spec> for plugins:register.");

      // TODO: normalizeSpec(spec)
      /** TODO:
       * 1. Quick verification to see the plugin is valid, and reject if invalid
       * 2. Download the pluging to /data/tmp/plugins/<plugin-name>
       * 3. Read plugin.json, and verify the file system (maybe we can implement MD5 hash verification too), and reject if invalid
       * 4. Move the plugin from /data/tmp/plugins/<plugin-name> to /src/plugins/<plugin-name>
       * 5. Register: add a record to `PluginsRegistry` (Database Table)
       * 6. Run the database migrations (initially we add new table structure to our current schema, planning to allow for per-plugin database later)
       * 7. Quick intergrity check
       * 8. Done
       */
      console.log("$commandPluginsRegister", spec);
    },
  },
  "plugins:list": {
    desc: "List plugins",
    async run(args) {
      const json = !!args.flags.json;
      // TODO: load registry from `PluginsRegistry`
      // TODO: (later) Maybe we can show expanded version of the list
      const data = [{ id: "@sovereign/blog", enabled: true }];
      if (json) console.log(JSON.stringify(data, null, 2));
      else
        data.forEach((p) => console.log(`${p.enabled ? "✔" : "✖"} ${p.id}`));
    },
  },
  "plugins:enable": {
    desc: "Enable a plugin",
    async run(args) {
      const id = args._[1];
      // TODO: Update `PluginsRegistry`
      if (!id) exitUsage("Missing <id> for plugins:enable.");
      console.log("$commandPluginsEnable", id);
    },
  },
  "plugins:disable": {
    desc: "Disable a plugin",
    async run(args) {
      const id = args._[1];
      // TODO: Update `PluginsRegistry`
      if (!id) exitUsage("Missing <id> for plugins:disable.");
      console.log("$commandPluginsDisable", id);
    },
  },
  "migrate:deploy": {
    desc: "Run migrations",
    async run(args) {
      const plugin = args.flags.plugin || null;
      /** TODO:
       * 1. Verify new migration is available and valid
       * 2. Run the migrations
       * 3. Quick intergrity check
       * 4. Done
       */
      console.log("$commandMigrateDeploy", { plugin });
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
    console.log("sv 0.1.0");
    return;
  }

  const cmd = args._[0];
  if (!cmd) exitUsage();

  const handler = commands[cmd];
  if (!handler) exitUsage(`Unknown command "${cmd}".`);

  await handler.run(args);
}

main().catch((err) => {
  console.error(err?.stack || err);
  process.exit(1);
});
