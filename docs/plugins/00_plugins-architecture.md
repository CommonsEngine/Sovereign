# Sovereign Plugin Architecture & Usage Guide

This document provides a complete overview of Sovereign’s plugin system — how it’s structured, how to build plugins, and how to integrate them into the platform.

## 1. Overview

Sovereign’s plugin architecture makes the platform fully extensible. Plugins can add new routes, user interfaces, database models, and backend services while sharing the same authentication, RBAC, and runtime environment as the core.

Plugins are self-contained modules discovered and mounted automatically at runtime through their `plugin.json` manifest.

## 2. Plugin Frameworks

There are two supported plugin frameworks, defined in `plugin.json` under the `framework` field.

| Framework   | Description                                                                                                                                                                                                                                    | Typical Use                                 |
| ----------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------- |
| **`js`**    | Server-side plugins written as **Express apps**. They export routers or middleware that Sovereign mounts under `/namespace` and `/api/plugins/namespace`.                                                                                      | APIs, integrations, or background services. |
| **`react`** | Front-end plugins built with **Vite** (or compatible bundlers). Each ships a compiled SPA (`dist/index.html`) and optional dev-server metadata for hot reload. Sovereign proxies them in development and serves them statically in production. | Dashboards, editors, client tools.          |

## 3. Plugin Types

The _type_ determines whether a plugin is global or project‑scoped. Set it explicitly via the top-level `type` field in `plugin.json`.

| Type               | Key Property        | Mount Path       | Behavior                                                                                     |
| ------------------ | ------------------- | ---------------- | -------------------------------------------------------------------------------------------- |
| **Module plugin**  | `"type": "module"`  | `/namespace`     | Single global instance for the whole workspace. Configuration stored once at platform level. |
| **Project plugin** | `"type": "project"` | `/namespace/:id` | Supports multiple instances per tenant or project, with data and config scoped by project.   |

## 4. Directory Layout

Each plugin lives under `/plugins/<namespace>` and follows this structure:

```
plugins/
  blog/
    plugin.json
    src/
    public/
    prisma/
    routes/
```

| Folder                    | Purpose                                                           |
| ------------------------- | ----------------------------------------------------------------- |
| `plugin.json`             | Manifest defining metadata, routes, capabilities, and UI options. |
| `src/`                    | Plugin source code (Express handlers or SPA source).              |
| `public/`                 | Static assets copied to `/public/plugins/<namespace>/`.           |
| `prisma/extension.prisma` | Database model extensions merged at build.                        |
| `routes/`                 | Optional custom routers for Express-based plugins.                |

## 5. Manifest Reference

A minimal manifest looks like this:

```jsonc
{
  "id": "@sovereign/blog",
  "name": "Blog",
  "framework": "react",
  "enabled": true,
  "type": "project",
  "entry": "dist/index.html",
  "sovereign": {
    "platformCapabilities": { "database": true },
    "userCapabilities": [{ "key": "user:plugin.blog.post.create", "roles": ["project:editor"] }],
  },
  "ui": {
    "icon": { "name": "book-open" },
    "layout": { "sidebar": true, "header": true },
  },
}
```

Refer to:

- [Capabilities Guide](../01_plugins-capabilities.md)
- [Plugin UI Guide](.02_./02_plugins-ui.md)

## 6. Lifecycle Hooks

Plugins may export lifecycle hooks from their entry file:

| Hook                    | Purpose                                         |
| ----------------------- | ----------------------------------------------- |
| `render`                | Renders SPA or SSR output.                      |
| `configure`             | Called at load time for setup/config injection. |
| `getRoutes`             | Returns Express routers for custom plugins.     |
| `onInstall` _(planned)_ | For seeding initial data or migrations.         |
| `onEnable` _(planned)_  | Called when plugin is activated.                |

## 7. Development Workflow

1. **Scaffold a plugin**
   ```bash
   sv plugins create <namespace> --framework react|js --type module|project
   ```
2. **Run the dev server**
   - SPA: Sovereign proxies Vite dev server.
   - Custom: Express routes hot reload automatically.
3. **Sync manifest/DB + reload (when adding new plugins)**
   - External sources: `sv plugins add <git-url|path>` (accepts `file://` URLs, git URLs, or local dirs). This runs the shared sync tool to rebuild `manifest.json`, upsert plugin metadata into the DB, and reload PM2 if present.
   - Local edits: `sv manifest generate` is still available for manual rebuilds.
4. **Toggle enable/disable**
   ```bash
   sv plugins enable <namespace>
   sv plugins disable <namespace>
   ```

## 8. Capabilities & Security

- **Platform capabilities** — request host-level services like `database`, `git`, or `mailer`.
- **User capabilities** — define permissions (`user:plugin.<ns>.<action>`) mapped to RBAC roles.
- The manifest builder validates declared capabilities during build.
- Reference: [Capabilities Guide](../01_plugins-capabilities.md)

## 9. UI Integration

- Controlled by the `ui` block in `plugin.json`.
- Defines icon, color palette, sidebar/header visibility, and layout options.
- Sidebar visibility is derived from capabilities; roles with access can see the entry.
- Reference: [Plugin UI](../02_plugins-ui.md)

## 10. Database Extensions

Each plugin can add Prisma models via `prisma/extension.prisma`.  
The build process composes all plugin schemas into a unified `platform/prisma/schema.prisma`.

## 11. Operational Tooling

- **Sync/update**: `node tools/plugins-update.mjs` (or indirectly via `sv plugins add/create`) reads plugin manifests, rebuilds `manifest.json`, upserts plugin metadata into the database, and reloads PM2 when available.
- **Private plugin pulls**: `tools/plugins-pull.mjs` supports per-plugin SSH keys (`.ssh/sovereign-plugins/<namespace>.key`) or HTTPS tokens (`.ssh/sovereign-plugins/<namespace>.pat`), with the base dir overrideable via `SV_PLUGINS_AUTH_DIR`.
- **Removal**: `node tools/plugins-remove.mjs <namespace> [--keep-files] [--dry-run]` removes a disabled plugin (safety checks + optional archiving), rebuilds the manifest, removes DB entries, and reloads PM2 if present. The CLI `sv plugins remove` delegates to this script.
- **PM2 optionality**: Both scripts skip reload gracefully if PM2 is not installed.

## 12. Deployment and Production

During manifest generation, **all plugins present under `/plugins/*`** are included — regardless of environment (`development` or `production`).

The only filters applied are based on plugin manifest flags:

- **`enabled: false`** → Excluded from all builds until re-enabled.
- **`devOnly: true`** → Excluded from manifest in all builds except explicitly forced test runs (even if `enabled`).

There is **no environment-based exclusion** beyond these flags.  
If a plugin exists in the filesystem, it will be included unless marked `devOnly` or `enabled: false`.

### Repository Whitelisting with `.gitignore`

In the main Sovereign repository, we rely on `.gitignore` to control **which plugin directories are versioned**.  
This ensures production builds (e.g., CI pipelines, Docker images) include only approved plugins without extra build logic.

Example:

```gitignore
/plugins/*
!/plugins/.gitkeep
!/plugins/users
!/plugins/settings
!/plugins/blog
```

With this pattern:

- Only allowlisted plugins are checked into Git.
- Ignored plugins (like cloned externals) remain local, never committed, and are still loadable during development if present on disk.

External or private plugins can be cloned or mounted into `/plugins` before the build process runs, and they’ll be picked up automatically as long as they exist locally.

## 13. Roadmap

- **v1.0.0**: SPA + Express plugin parity, PWA‑ready runtime.
- **Post‑1.0.0**: Mobile app integration, federated instance linking, end‑to‑end encryption for plugin data.

## 14. Summary

- Sovereign currently supports:
- **Two plugin frameworks** → `react`, `js`
- **Two plugin kinds** → `project`, `module`
  - **Two plugin kinds** → `module`, `project`
- The manifest defines all metadata, routes, and capabilities.
- Plugins integrate with the same RBAC and service layer as the core.
- The CLI handles scaffolding, validation, and manifest synchronization.

Plugins are first‑class citizens in Sovereign’s ecosystem — small, independent units that evolve the platform while respecting user autonomy and data sovereignty.
