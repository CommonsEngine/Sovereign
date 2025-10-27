#!/usr/bin/env node
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";
import process from "node:process";
import { createRequire } from "module";

const require = createRequire(import.meta.url);
const pkg = require("../package.json");

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
      plugins
        add <spec>                      Register/install a plugin (path|git|npm)
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

function printNamespaceHelp(ns) {
  const node = commands[ns];
  if (node && typeof node.__help__ === "string") {
    console.log(node.__help__);
  } else {
    printUsage();
  }
}

// Command Tree
const commands = {
  // Global meta (no run; handled separately)
  meta: {
    name: "sv",
    version: pkg.manifest.cli.version,
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

  plugins: {
    __help__: `
      Usage:
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

    add: {
      desc: "Register/install a plugin from path/git/npm",
      async run(args) {
        console.log(args);
        console.info(`
          // TODO:
          // - Resolve <spec> (path | git URL | npm)
          // - Validate manifest (plugin.json), checksum (optional)
          // - Copy/prepare into src/plugins/<name> or data/plugins/<name>
          // - Update registry (DB/file)
          // - Respect --dry-run
          // - Print human output or JSON (if --json present)  
        `);
      },
    },

    list: {
      desc: "List plugins",
      async run(args) {
        console.log(args);
        console.info(`
          // TODO:
          // - Load registry
          // - Filter by --enabled/--disabled
          // - Output as table (human) or array (JSON) if --json
          // - Exit 0 (even if empty)
        `);
      },
    },

    enable: {
      desc: "Enable a plugin by namespace",
      async run(args) {
        console.log(args);
        console.info(`
          // TODO:
          // - Read <namespace>
          // - Update registry: enabled=true (idempotent)
          // - Validate dependencies/conflicts (future)
          // - Respect --dry-run
        `);
      },
    },

    disable: {
      desc: "Disable a plugin by namespace",
      async run(args) {
        console.log(args);
        console.info(`
          // TODO:
          // - Read <namespace>
          // - Update registry: enabled=false (idempotent)
          // - Respect --dry-run
        `);
      },
    },

    remove: {
      desc: "Unregister/remove a plugin",
      async run(args) {
        console.log(args);
        console.info(`
          // TODO:
          // - Read <namespace>
          // - Safety checks (in use? migrations?)
          // - Remove from registry; optionally prune files
          // - Respect --dry-run
        `);
      },
    },

    show: {
      desc: "Show plugin details",
      async run(args) {
        console.log(args);
        console.info(`
          // TODO:
          // - Read <namespace>
          // - Print manifest + status (human) or JSON
        `);
      },
    },

    validate: {
      desc: "Validate a plugin directory",
      async run(args) {
        console.log(args);
        console.info(`
          // TODO:
          // - Read <path>
          // - Verify plugin.json, required files, schema
          // - Print diagnostics; non-zero exit on failure
        `);
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
        console.log(args);
        console.info(`
          // TODO:
          // - Parse optional --plugin
          // - Validate pending migrations
          // - Execute (or simulate with --dry-run)
          // - Print summary; JSON if --json
          // - Exit non-zero on failure
        `);
      },
    },

    status: {
      desc: "Show migration status",
      async run(args) {
        console.log(args);
        console.info(`
          // TODO:
          // - Inspect migration history
          // - Print human summary or JSON
          // - Exit 0
        `);
      },
    },

    generate: {
      desc: "Generate a new migration (optional exposure)",
      async run(args) {
        console.log(args);
        console.info(`
          // TODO:
          // - Plugin/core target selection
          // - Produce migration files; guard in CI
        `);
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
    console.log(`sv ${pkg.manifest.cli.version}`);
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
