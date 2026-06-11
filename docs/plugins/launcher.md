# Launcher

**Version:** 0.1
**Date:** June 2026
**Author:** kasunben
**Purpose:** Canonical specification for the Sovereign Launcher plugin — the single source of truth for its manifest, access model, functional requirements, and build plan.
**Status:** Draft

---

Launcher is the default home screen for a Sovereign instance. It lists all
installed and enabled plugins the current user has access to, giving every user
a single entry point regardless of how many plugins are installed.

The plugin ships in the monorepo (`type: platform`) and serves the platform root
`/` by default. An admin can promote any other plugin to serve `/` instead
(see PLT-12/PLT-13 and CON-11), in which case the Launcher remains accessible at
`/launcher`.

**Design principle:** the Launcher should be the simplest possible entry point
in v0.1 — a clean grid of icons. Feature richness (quick-actions, recent
activity, sub-project shortcuts) is explicitly deferred to post-v1.

## Contents

- [Identity and manifest](#identity-and-manifest)
- [Access control](#access-control)
- [Functional requirements](#functional-requirements)
- [Sidebar behaviour](#sidebar-behaviour)
- [Directory structure](#directory-structure)
- [Data model](#data-model)
- [SDK dependencies](#sdk-dependencies)
- [UI](#ui)
- [Build plan](#build-plan)
- [Open questions](#open-questions)
- [Changelog](#changelog)

---

## Identity and manifest

| Property                           | Value                         |
| ---------------------------------- | ----------------------------- |
| `id`                               | `fs.sovereign.launcher`       |
| `name`                             | `Launcher`                    |
| `type`                             | `platform`                    |
| `runtime`                          | `native`                      |
| `routePrefix`                      | `/launcher`                   |
| `shell`                            | `default`                     |
| `adminOnly`                        | omitted (`false`)             |
| `icon`                             | `icon.svg`                    |
| `permissions`                      | `auth:session`, `db:readOnly` |
| `compatibility.minPlatformVersion` | `0.4.0`                       |

Proposed `manifest.json`:

```json
{
  "schemaVersion": 1,
  "id": "fs.sovereign.launcher",
  "name": "Launcher",
  "version": "0.1.0",
  "description": "Home screen — lists all installed plugins for easy access.",
  "type": "platform",
  "runtime": "native",
  "routePrefix": "/launcher",
  "shell": "default",
  "icon": "icon.svg",
  "permissions": ["auth:session", "db:readOnly"],
  "compatibility": {
    "minPlatformVersion": "0.4.0"
  }
}
```

No `repository` field — platform plugins live in the monorepo. The Launcher
declares `db:readOnly` (not `db:readWrite`) — it only reads the plugin registry
and writes nothing in v1.

---

## Access control

Launcher is available to all authenticated users. There is no admin-only gate.

Within the launcher:

- Each plugin tile is shown only if the current user has access to that plugin
  (i.e. the plugin is installed, enabled, and either `adminOnly: false` or the
  user is `platform:admin`).
- Platform chrome plugins (`fs.sovereign.launcher`, `fs.sovereign.account`,
  `fs.sovereign.console`) are excluded from the tile grid — they are always
  accessible via the sidebar chrome, not through the Launcher grid.
- `adminOnly: true` plugins appear in a separate "Admin" section, visible only
  to `platform:admin` users.

---

## Functional requirements

Requirements are versioned to their milestone. IDs are stable — never renumber
or reuse an LCH-\* id.

### v0.1 — Core

| ID     | Requirement                                                                                                                                                                                |
| ------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| LCH-01 | Display all installed, enabled, accessible plugins as tiles. Each tile shows the plugin's icon (from the `icon` manifest field, or a generated monogram if absent), name, and description. |
| LCH-02 | Clicking a tile navigates to the plugin's `routePrefix`.                                                                                                                                   |
| LCH-03 | Plugins with `adminOnly: true` are shown in a separate "Admin" section below the main grid. This section is hidden for `platform:user` role users.                                         |
| LCH-04 | Platform chrome plugins (`fs.sovereign.launcher`, `fs.sovereign.account`, `fs.sovereign.console`) are excluded from all grid sections.                                                     |
| LCH-05 | If no non-chrome plugins are installed, show an empty-state message with a pointer to the Console plugin to install plugins.                                                               |

### v0.2 — Richer tiles (post-v1)

| ID     | Requirement                                                                                                                                      |
| ------ | ------------------------------------------------------------------------------------------------------------------------------------------------ |
| LCH-06 | Multi-project plugins (e.g. Plainwrite) show a compact list of the user's recent sub-projects inline in the tile, plus a "New project" shortcut. |
| LCH-07 | Search and filter the plugin grid by name or description.                                                                                        |
| LCH-08 | Tiles display a badge for unread notification counts (once the notification SDK surface is available).                                           |

---

## Sidebar behaviour

The Launcher plugin drives the **first icon** in the sidebar middle section.
This icon is special:

- It always appears first, regardless of install order.
- It points to `/` (the platform root), not to `/launcher` directly. The
  platform resolves `/` to the configured root plugin's `routePrefix` (default:
  `/launcher`; admin can change this via CON-11).
- It cannot be hidden or reordered by users (v1).
- Its icon is the configured root plugin's `icon.svg` (not necessarily the
  Launcher's own icon, if the admin has promoted a different plugin to root).
- When the Launcher is **not** the configured root plugin, it appears in the
  middle section as a regular icon linking to `/launcher` — the only chrome
  plugin that can appear there. This guarantees the Launcher always remains
  reachable from the sidebar (PLT-12).

---

## Directory structure

Launcher lives in the monorepo under `plugins/launcher/`.

```
plugins/launcher/
├── manifest.json
├── icon.svg                     # Launcher icon — grid-of-dots or home symbol
├── app/
│   └── page.tsx                 # Plugin grid: regular + admin sections
└── components/
    ├── PluginGrid.tsx            # Grid of plugin tiles
    └── PluginTile.tsx            # Single tile: icon, name, description
```

No `db/`, `migrations/`, or `lib/` directories — Launcher has no private tables
and no complex business logic. It reads the plugin registry through the platform
SDK.

---

## Data model

Launcher has no plugin-specific database tables. It reads the platform plugin
registry (maintained by the runtime) via `sdk.db`. The registry exposes the
installed plugin list, their manifest fields (including `icon`, `name`,
`description`, `adminOnly`), and their enabled/disabled status.

---

## SDK dependencies

| SDK surface | Used for                                                           | Available from |
| ----------- | ------------------------------------------------------------------ | -------------- |
| `sdk.auth`  | Current user session; role check for the admin section             | Task 0.4.02    |
| `sdk.db`    | Read plugin registry (installed plugins + their manifest metadata) | Task 0.5.05    |

---

## UI

Launcher consumes `@sovereignfs/ui` exclusively.

**Layout:** Responsive grid of plugin tiles. Tiles are square cards with the
plugin icon centred above the name and a one-line description below. On mobile
the grid collapses to a narrower column count.

**Empty state:** When no non-chrome plugins are installed, a full-bleed empty
state with a "No plugins installed" message and a link to `/console` (admin
only) or a "Contact your admin" note (regular users).

**Net-new primitives likely needed in `packages/ui`:**

- **Plugin tile card** — square card with icon area, name, and optional
  description. Reusable wherever a plugin is represented as a navigable item.
  Should be tokenised for hover/active states.
- **Monogram avatar** — generates a one- or two-letter initial circle from a
  string. Used as fallback when `icon` is absent. Also reusable in Account
  plugin (user initials fallback).

---

## Build plan

Two milestones.

### v0.1 — Core (LCH-01–05)

Plugin grid page, tile component, admin section logic, empty state. Reads
registry via SDK stub (direct table access in v0.1; migrated to `sdk.db` once
0.5.05 lands).

**Done when:** An authenticated user can navigate to `/launcher` and see all
installed, accessible plugins as tiles; clicking a tile navigates to the plugin.
Admin users see a separate "Admin" section for `adminOnly` plugins.

### v0.2 — Richer tiles (LCH-06–08)

Multi-project tile expansion, search, notification badges.

---

## Open questions

1. **Root plugin icon in sidebar.** When admin promotes a different plugin as
   root (e.g. Tasks), the first sidebar icon should show that plugin's icon, not
   the Launcher's. The sidebar shell must read the current `root_plugin_id` from
   platform settings and resolve its icon at render time. Confirm this is handled
   in the shell layer, not in the Launcher plugin itself.

2. **Plugin registry SDK surface.** The Launcher reads installed plugins via
   `sdk.db`. The exact shape of the plugin registry table(s) in `packages/db` is
   determined by Task 0.4.03 (Plugin registry). The Launcher's `page.tsx` should
   be written against the registry table shape once that task is complete.

3. **Icon resolution.** The `icon` field in a plugin's manifest is a path
   relative to the plugin root. The runtime must resolve this to a servable URL
   for use in `<img>` tags. How this is served (static file serving, a dedicated
   API route, inline SVG) is a runtime concern — confirm the mechanism in Task
   0.3.10.

---

## Changelog

| Version | Date     | Change                                     |
| ------- | -------- | ------------------------------------------ |
| 0.1     | Jun 2026 | Initial draft — platform home screen spec. |
