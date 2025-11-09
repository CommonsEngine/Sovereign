# Sovereign CLI

The `sv` command-line interface manages plugins, database migrations, and manifest generation for a Sovereign workspace. It is meant to run from the repository root (or via `yarn sv`, `pnpm sv`, etc.). For a platform-wide architectural overview (routing, styling, capability model), read `docs/architecture.md`.

```
sv [global options] <namespace> <command> [args]
```

## Global Options

| Flag                                 | Description                                           |
| ------------------------------------ | ----------------------------------------------------- |
| `-h, --help`                         | Print namespace or command help.                      |
| `-v, --version`                      | Show the CLI version (mirrors `package.json`).        |
| `--json`                             | Emit JSON payloads where the sub-command supports it. |
| `--dry-run`                          | Simulate mutating operations; nothing is written.     |
| `--verbose`, `--quiet`, `--no-color` | Adjust logging style/verbosity.                       |
| `--config`, `--cwd`                  | Reserved for future multi-instance support.           |

## Plugin Commands

| Command                                            | Purpose                                                                                                   |
| -------------------------------------------------- | --------------------------------------------------------------------------------------------------------- |
| `sv plugins create <namespace>`                    | Scaffold a new plugin from the built-in templates.                                                        |
| `sv plugins add <spec>`                            | Install a plugin from a directory or git URL.                                                             |
| `sv plugins list [--json] [--enabled\|--disabled]` | Inspect installed plugins plus their enablement state.                                                    |
| `sv plugins enable <namespace>`                    | Turn on a plugin by clearing `draft`/`devOnly` in its manifest and rebuilding the workspace manifest.     |
| `sv plugins disable <namespace>`                   | Take a plugin offline by forcing `draft`/`devOnly` in its manifest and rebuilding the workspace manifest. |
| `sv plugins remove <namespace>`                    | Unregister a disabled plugin after safety checks, optionally archiving its files.                         |
| `sv plugins show <namespace> [--json]`             | Inspect plugin manifest details plus enablement status.                                                   |
| `sv plugins validate <path>`                       | Lint a plugin directory for manifest correctness and required files.                                      |

### `sv plugins create <namespace> [--type custom|spa]`

Bootstraps a plugin directory under `plugins/<namespace>` using the curated templates stored in `tools/plugin-templates`. The command rejects duplicate namespaces or manifest ids, copies either the `custom` or `spa` scaffold, replaces placeholders (name, description, ids, dev server port, etc.), and optionally rebuilds `manifest.json`.

**Flags**

| Flag                       | Effect                                                                                             |
| -------------------------- | -------------------------------------------------------------------------------------------------- |
| `--type <custom\|spa>`     | Choose which scaffold to use (`custom` by default).                                                |
| `--name "<display name>"`  | Human-facing plugin name; defaults to the namespace in Title Case.                                 |
| `--description "<text>"`   | Short description embedded into the manifest.                                                      |
| `--id <@scope/name>`       | Override the generated `plugin.json#id` (`@sovereign/<namespace>` by default).                     |
| `--version <semver>`       | Initial version string (`0.1.0` by default).                                                       |
| `--author "<name>"`        | Author metadata stored in the manifest.                                                            |
| `--license "<identifier>"` | License string stored in the manifest.                                                             |
| `--dev-port <port>`        | Override the dev server port embedded in SPA manifests (random port between 4100–4299 by default). |
| `--skip-manifest`          | Skip running `sv manifest generate` after scaffolding.                                             |
| `--dry-run`                | Print what would happen without writing files.                                                     |
| `--json`                   | Emit a JSON summary instead of human-readable text.                                                |

**Example**

```
# Create a custom plugin
sv plugins create acme-support --name "Acme Support Desk"

# Create an SPA plugin using a specific id + dev port
sv plugins create companion --type spa --id @acme/companion --dev-port 4500
```

### `sv plugins add <spec>`

`<spec>` can be:

1. A local directory (absolute or relative path).
2. A git URL (any format accepted by `git clone`, optional `#ref`).

During installation the CLI:

1. Resolves and clones (if needed) the spec into a temporary directory.
2. Loads `plugin.json`, ensuring `id`, `version`, `type`, and namespace are valid.
3. Prevents conflicts by comparing against existing plugins (by `id` and namespace).
4. Copies the plugin into `plugins/<namespace>` while skipping VCS folders (e.g. `.git`).
5. Rebuilds `manifest.json` by invoking `tools/build-manifest.mjs`.

**Flags**

| Flag                  | Effect                                                                      |
| --------------------- | --------------------------------------------------------------------------- |
| `--dry-run`           | Reports what would happen without copying files or rebuilding the manifest. |
| `--json`              | Prints a JSON result (action, id, namespace, version, paths, checksum).     |
| `--checksum=<sha256>` | Verifies the plugin directory hash before install.                          |

### Example

```
# Install from a local path
sv plugins add ./packages/example-plugin

# Install directly from git
sv plugins add git+https://github.com/sovereign/example-plugin.git#main

# Plan the install only
sv plugins add ../my-plugin --dry-run --json
```

### `sv plugins list`

Lists every plugin known to the manifest registry and annotates each with its namespace, plugin id, version, type, and whether the manifest currently marks it as enabled. Empty registries simply report `No plugins found.` and exit with status `0`.

**Flags**

| Flag         | Effect                                                            |
| ------------ | ----------------------------------------------------------------- |
| `--json`     | Emit the filtered rows as an array of objects.                    |
| `--enabled`  | Show only enabled plugins.                                        |
| `--disabled` | Show only disabled plugins (mutually exclusive with `--enabled`). |

**Example**

```
sv plugins list
Namespace          ID                           Version        Type    Enabled
-----------------  ---------------------------  -------------  ------  -------
blog               @sovereign/blog              1.0.0-alpha.7  custom  yes
```

### `sv plugins enable <namespace>`

Marks an installed plugin as production-ready by forcing its `plugin.json` to set `draft: false` and `devOnly: false`, then regenerates `manifest.json` so the platform picks up the change. The command fails if the namespace is unknown.

**Flags**

| Flag        | Effect                                                                                                      |
| ----------- | ----------------------------------------------------------------------------------------------------------- |
| `--dry-run` | Shows the manifest file that would be edited and the rebuild that would be triggered without touching disk. |

**Example**

```
# Actually enable the blog plugin
sv plugins enable blog

# Preview what would change
sv plugins enable papertrail --dry-run
```

### `sv plugins disable <namespace>`

Flips an installed plugin back into draft/dev-only mode by setting `draft: true` and `devOnly: true` in its `plugin.json`, then rebuilds `manifest.json`. This ensures runtime components stop treating the plugin as enabled. The command exits with an error if the namespace does not map to an installed plugin.

**Flags**

| Flag        | Effect                                                                                     |
| ----------- | ------------------------------------------------------------------------------------------ |
| `--dry-run` | Prints the manifest file that would be edited and notes the rebuild without touching disk. |

**Example**

```
# Disable the blog plugin and rebuild manifest
sv plugins disable blog

# Preview the change only
sv plugins disable blog --dry-run
```

### `sv plugins remove <namespace>`

Unregisters a plugin entirely. The plugin must already be disabled (`draft: true` and `devOnly: true`) so that running services are not surprised by the removal. Before touching disk the command verifies the namespace exists and that there are no lingering migrations under `plugins/<namespace>/migrations` or `plugins/<namespace>/prisma/migrations`; if either directory still contains files, removal aborts so you can clean up manually. When the checks pass the plugin directory is deleted (or archived) and `tools/build-manifest.mjs` is invoked to keep `manifest.json` in sync. Use this after you are sure the plugin is no longer needed.

**Flags**

| Flag           | Effect                                                                                                                 |
| -------------- | ---------------------------------------------------------------------------------------------------------------------- |
| `--dry-run`    | Prints the actions that _would_ run (safety checks, archive/delete, manifest rebuild) without touching the filesystem. |
| `--keep-files` | Moves the plugin into `.sv-plugins-archive/<namespace>-<timestamp>` instead of deleting it outright.                   |

**Example**

```
# Remove a disabled plugin and leave no trace
sv plugins remove papertrail

# Preview the removal flow and archive files instead of deleting them
sv plugins remove papertrail --dry-run --keep-files
```

### `sv plugins show <namespace> [--json]`

Displays everything known about an installed plugin: on-disk manifest data, whether the workspace manifest currently registers/enables it, and the paths involved. Any namespace or manifest id understood by `sv plugins list` works here.

**Flags**

| Flag     | Effect                                                          |
| -------- | --------------------------------------------------------------- |
| `--json` | Emit a machine-readable object with manifest + status metadata. |

**Example**

```
sv plugins show blog
sv plugins show @sovereign/blog --json
```

### `sv plugins validate <path>`

Runs a fast lint over a plugin directory. Validation ensures the directory exists, `plugin.json` passes the same basic schema checks used during `sv plugins add`, and that type-specific files exist (`index.js` for `custom`, `dist/index.js` for `spa`). Failures are printed and the command exits with status `1`. Passing validations print a short success line.

**Flags**

| Flag     | Effect                               |
| -------- | ------------------------------------ |
| `--json` | Emits diagnostics as a JSON payload. |

**Example**

```
sv plugins validate ./plugins/blog
sv plugins validate ../my-plugin --json
```

## Manifest Commands

| Command                     | Description                                                    |
| --------------------------- | -------------------------------------------------------------- |
| `sv manifest generate`      | Runs `tools/build-manifest.mjs` to regenerate `manifest.json`. |
| `sv manifest show [--json]` | Prints a summary table or the raw JSON manifest.               |

Use `generate` any time plugin contents change outside of `sv plugins add`.

## Migration Commands

`sv migrate` keeps lightweight bookkeeping for both the core Prisma migrations (`platform/prisma/migrations`) and optional plugin migrations (folders named `prisma/migrations` or `migrations` under each plugin). Use `--plugin <namespace-or-id>` to scope actions to a plugin; omit the flag to work on the core set.

| Command                                                  | Description                                                                    |
| -------------------------------------------------------- | ------------------------------------------------------------------------------ |
| `sv migrate deploy [--plugin <id>] [--dry-run] [--json]` | Apply any migration directories that have not yet been recorded as applied.    |
| `sv migrate status [--plugin <id>] [--json]`             | Show total/applied/pending migrations for the selected target.                 |
| `sv migrate generate <name> [--plugin <id>]`             | Scaffold a timestamped migration directory with a `migration.sql` placeholder. |

### `sv migrate deploy`

Scans the target migration directory, compares it against the CLI’s state file (`data/.sv-migrations-state.json`), and applies (records) any directories that have not yet been run. With `--dry-run` the command only lists what would be applied. `--json` prints a machine-readable summary.

**Flags**

| Flag            | Effect                                                  |
| --------------- | ------------------------------------------------------- |
| `--plugin <id>` | Limit to a specific plugin namespace or manifest id.    |
| `--dry-run`     | Only report pending migrations; do not record anything. |
| `--json`        | Emit `{ target, pending, total, dryRun }`.              |

### `sv migrate status`

Reports how many migration directories exist, how many have already been applied via `sv migrate deploy`, and which remain pending. Accepts the same `--plugin` / `--json` flags as `deploy`.

### `sv migrate generate`

Creates a timestamped folder (e.g. `20250318121500_add_feature_flag`) plus a `migration.sql` stub beneath the appropriate migrations directory. Requires a migration name argument and refuses to run when `CI=true` to avoid generating artifacts during automated builds.

## Notes for Future Development

- Replace the placeholder SQL writer inside `sv migrate deploy` with real database execution once Prisma or another engine is wired up; keep the current logging shape so this page remains accurate if we revert in the meantime.
- The migration state file (`data/.sv-migrations-state.json`) is intended as a stopgap. When native migration tracking lands, remove the file and update this document to point to the canonical source of truth.
- `sv plugins validate` only checks for the most critical files today. Expand this to full schema + capability verification later, but keep the CLI surface the same so it’s easy to undo if needed.
