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

## 3. Plugin Kinds

The _kind_ determines whether a plugin is global or project‑scoped. It is inferred at runtime from the `allowMultipleInstances` flag in `plugin.json`.

| Kind               | Key Property                                | Mount Path       | Behavior                                                                                     |
| ------------------ | ------------------------------------------- | ---------------- | -------------------------------------------------------------------------------------------- |
| **Module plugin**  | `"allowMultipleInstances": false` (default) | `/namespace`     | Single global instance for the whole workspace. Configuration stored once at platform level. |
| **Project plugin** | `"allowMultipleInstances": true`            | `/namespace/:id` | Supports multiple instances per tenant or project, with data and config scoped by project.   |

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
  "entry": "dist/index.html",
  "allowMultipleInstances": true,
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
   sv plugins create <namespace> --framework react|js
   ```
2. **Run the dev server**
   - SPA: Sovereign proxies Vite dev server.
   - Custom: Express routes hot reload automatically.
3. **Regenerate the manifest**
   ```bash
   sv manifest generate
   ```
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

## 11. Deployment and Production

During manifest generation, **all plugins present under `/plugins/*`** are included — regardless of environment (`development` or `production`).

The only filters applied are based on plugin manifest flags:

- **`devOnly: true`** → Excluded from manifest in all builds except explicitly forced test runs.
- **`draft: true`** → Excluded from production builds; included in development for testing and previews.

There is **no environment-based exclusion** beyond these flags.  
If a plugin exists in the filesystem, it will be included unless marked `devOnly` or `draft`.

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
  - **Two plugin kinds** → `module`, `project`
- The manifest defines all metadata, routes, and capabilities.
- Plugins integrate with the same RBAC and service layer as the core.
- The CLI handles scaffolding, validation, and manifest synchronization.

Plugins are first‑class citizens in Sovereign’s ecosystem — small, independent units that evolve the platform while respecting user autonomy and data sovereignty.
